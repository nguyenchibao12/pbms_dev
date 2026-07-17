import { Op } from 'sequelize';
import { Zone, VehicleType, Floor } from '../models/index.js';
import { AppError } from './helpers.js';

/**
 * Sức chứa tầng theo DIỆN TÍCH: Σ(zone.total_slots × slot_area_m2) ≤ area_m2. NULL = KHÔNG GIỚI HẠN.
 * `assertZoneFitsFloorArea` kiểm TRONG 1 tầng; `assertFloorAreaMonotonic` kiểm GIỮA các tầng.
 */

// Bọc Number() vì DB trả DECIMAL dạng CHUỖI ("25.00"); `?? 0` tránh undefined.
export const slotAreaOf = (vehicleType) => Number(vehicleType?.slot_area_m2 ?? 0);

/** Số slot tối đa của 1 loại xe vừa trong một diện tích cho trước. */
export const maxSlotsForArea = (areaM2, slotAreaM2) => {
  const area = Number(areaM2);
  const per = Number(slotAreaM2);
  if (!Number.isFinite(area) || area <= 0) return 0;   // không có diện tích → 0 chỗ (KHÔNG ném lỗi)
  if (!Number.isFinite(per) || per <= 0) {             // loại xe chưa cấu hình slot_area_m2 → 400
    throw new AppError(                                //   (0 = "chưa cấu hình", xem vehicleType.service)
      'Loại xe chưa cấu hình diện tích slot (slot_area_m2). Cập nhật loại xe trước.',
      400,
      'VALIDATION_ERROR',
    );
  }
  return Math.floor(area / per);                       // tròn XUỐNG: 800/1.8 = 444.4 → 444 chỗ
};

/**
 * Tổng diện tích các khu đang chiếm trên 1 tầng.
 * @param {number} floorId
 * @param {object} opts { excludeZoneId } — bỏ qua 1 khu (khi đang sửa chính khu đó)
 */
export const computeFloorAreaUsed = async (floorId, { excludeZoneId } = {}, transaction) => {
  const zones = await Zone.findAll({
    where: { floor_id: floorId },
    include: [{ association: 'vehicleType', attributes: ['vehicle_type_id', 'slot_area_m2'] }],
    transaction,                                       // kèm loại xe để biết m²/chỗ của từng khu
  });
  let areaUsed = 0;
  for (const z of zones) {
    // Bỏ khu ĐANG SỬA ra, không thì nó tự cộng bản cũ của mình vào → sửa gì cũng báo vượt.
    if (excludeZoneId && z.zone_id === Number(excludeZoneId)) continue;
    // total_slots = SỨC CHỨA khai báo, không phải slot đã tạo thật — chỗ chưa sinh vẫn "xí" diện tích.
    areaUsed += Number(z.total_slots) * slotAreaOf(z.vehicleType);
  }
  return areaUsed;
};

/**
 * Chặn nếu thêm/sửa một khu làm tổng diện tích vượt sức chứa tầng.
 * Không làm gì nếu floor.area_m2 chưa đặt (NULL = không giới hạn — legacy).
 *
 * @param floor          instance Floor
 * @param vehicleType    instance VehicleType của khu
 * @param totalSlots     total_slots dự kiến của khu
 * @param opts           { excludeZoneId } khi đang sửa khu hiện có
 */
export const assertZoneFitsFloorArea = async (
  floor,
  vehicleType,
  totalSlots,
  { excludeZoneId } = {},
  transaction,
) => {
  if (floor.area_m2 == null) return;                   // tầng không đặt diện tích → bỏ qua (linh hoạt)
  const floorArea = Number(floor.area_m2);
  const slotArea = slotAreaOf(vehicleType);
  if (slotArea <= 0) {                                 // loại xe chưa có m²/chỗ → không tính được
    throw new AppError(
      `Loại xe "${vehicleType.type_name}" chưa cấu hình diện tích slot (slot_area_m2).`,
      400,
      'VALIDATION_ERROR',
    );
  }

  const usedByOthers = await computeFloorAreaUsed(floor.floor_id, { excludeZoneId }, transaction);
  const wanted = Number(totalSlots) * slotArea;        // khu này muốn chiếm thêm bao nhiêu m²
  // +1e-6: đệm sai số số thực (JS: 8 × 1.8 = 14.400000000000002) → 300.0 không bị coi là > 300.
  if (usedByOthers + wanted > floorArea + 1e-6) {
    const free = Math.max(floorArea - usedByOthers, 0);  // còn trống bao nhiêu m²
    const fitSlots = Math.floor(free / slotArea);        // ...nhét được thêm mấy slot loại này
    throw new AppError(                                  // lỗi nói luôn cách sửa, không bắt tự tính
      `Vượt diện tích tầng: cần ${wanted.toFixed(1)} m² nhưng chỉ còn ${free.toFixed(1)}/${floorArea.toFixed(1)} m² ` +
        `(tối đa ${fitSlots} slot loại "${vehicleType.type_name}").`,
      409,
      'CONFLICT',
    );
  }
};

/**
 * Đi từ DƯỚI LÊN, diện tích sàn KHÔNG ĐƯỢC TĂNG (hầm ≥ trệt ≥ tầng trên) — chặn tòa nhà "phình giữa".
 * Chỉ so tầng LIỀN KỀ: mọi đường ghi tầng đều gọi hàm này nên dãy luôn đúng luật (quy nạp).
 */
export const assertFloorAreaMonotonic = async (
  { floorLevel, areaM2, excludeFloorId } = {},
  transaction,
) => {
  if (areaM2 == null) return;                          // tầng NULL = không giới hạn → không có số để so
  const area = Number(areaM2);
  const level = Number(floorLevel);
  // Đang SỬA tầng này → loại nó ra, không thì nó tự so với chính mình (bản cũ).
  const notSelf = excludeFloorId ? { floor_id: { [Op.ne]: Number(excludeFloorId) } } : {};
  // Op.not = IS NOT NULL. Dùng nhầm Op.ne thì SQL ra `x != NULL` (không bao giờ đúng) → guard tê liệt.
  const hasArea = { area_m2: { [Op.not]: null } };

  const below = await Floor.findOne({                  // tầng liền kề phía DƯỚI (có đặt diện tích)
    where: { ...notSelf, ...hasArea, floor_level: { [Op.lt]: level } },
    order: [['floor_level', 'DESC']],                  // DESC ⇒ lấy tầng cao nhất trong các tầng thấp hơn
    transaction,
  });
  if (below && area > Number(below.area_m2) + 1e-6) {  // mình RỘNG hơn tầng dưới ⇒ phình ra ⇒ chặn
    throw new AppError(
      `Tầng ở cao độ ${level} (${area.toFixed(1)} m²) rộng hơn tầng dưới ` +
        `"${below.label || below.floor_code}" (${Number(below.area_m2).toFixed(1)} m²). ` +
        `Diện tích sàn không được tăng khi lên cao.`,
      409,
      'CONFLICT',
    );
  }

  // Phải kiểm CẢ phía trên vì tầng mới có thể CHÈN VÀO GIỮA: chèn tầng hẹp xuống dưới tầng rộng
  // cũng là phình lên trên, chỉ kiểm phía dưới sẽ lọt.
  const above = await Floor.findOne({                  // tầng liền kề phía TRÊN
    where: { ...notSelf, ...hasArea, floor_level: { [Op.gt]: level } },
    order: [['floor_level', 'ASC']],                   // ASC ⇒ lấy tầng thấp nhất trong các tầng cao hơn
    transaction,
  });
  if (above && Number(above.area_m2) > area + 1e-6) {  // tầng trên rộng hơn MÌNH ⇒ cũng phình ⇒ chặn
    throw new AppError(
      `Tầng ở cao độ ${level} (${area.toFixed(1)} m²) hẹp hơn tầng trên ` +
        `"${above.label || above.floor_code}" (${Number(above.area_m2).toFixed(1)} m²). ` +
        `Diện tích sàn không được tăng khi lên cao.`,
      409,
      'CONFLICT',
    );
  }
};

export const getVehicleTypeOrThrow = async (vehicleTypeId, transaction) => {
  const vt = await VehicleType.findByPk(vehicleTypeId, { transaction });
  if (!vt) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');
  return vt;
};

/**
 * Chặn nếu ĐỔI slot_area_m2 của một loại xe khiến bất kỳ TẦNG nào (có khu dùng loại xe đó) vượt
 * diện tích. Ràng buộc diện tích trước đây chỉ kiểm lúc tạo/sửa KHU; đổi diện tích/slot ở loại xe
 * lại tác động ngược lên mọi khu loại đó mà không ai kiểm → có thể vỡ ràng buộc âm thầm.
 * Tính lại từng tầng: diện tích các khu loại KHÁC (giữ nguyên) + khu loại NÀY × slot_area MỚI.
 */
export const assertVehicleTypeAreaFitsFloors = async (vehicleTypeId, newSlotArea, transaction) => {
  const per = Number(newSlotArea);
  if (!Number.isFinite(per) || per <= 0) return; // 0/none = chưa cấu hình, không ràng buộc (giữ hành vi cũ)

  const zonesOfType = await Zone.findAll({
    where: { vehicle_type_id: vehicleTypeId },
    attributes: ['zone_id', 'floor_id', 'total_slots'],
    transaction,
  });
  if (zonesOfType.length === 0) return;

  const floorIds = [...new Set(zonesOfType.map((z) => z.floor_id))];
  for (const floorId of floorIds) {
    const floor = await Floor.findByPk(floorId, { transaction });
    if (!floor || floor.area_m2 == null) continue; // tầng không giới hạn diện tích

    // Diện tích các khu loại KHÁC trên tầng (dùng slot_area_m2 hiện tại của chúng).
    const otherZones = await Zone.findAll({
      where: { floor_id: floorId, vehicle_type_id: { [Op.ne]: vehicleTypeId } },
      include: [{ association: 'vehicleType', attributes: ['slot_area_m2'] }],
      transaction,
    });
    const otherArea = otherZones.reduce(
      (sum, z) => sum + Number(z.total_slots) * slotAreaOf(z.vehicleType),
      0,
    );

    // Diện tích các khu loại NÀY trên tầng, tính theo slot_area_m2 MỚI.
    const thisSlots = zonesOfType
      .filter((z) => z.floor_id === floorId)
      .reduce((sum, z) => sum + Number(z.total_slots), 0);
    const wanted = thisSlots * per;

    if (otherArea + wanted > Number(floor.area_m2) + 1e-6) {
      throw new AppError(
        `Không thể đặt diện tích/slot = ${per} m²: tầng "${floor.label || floor.floor_code}" sẽ vượt ` +
          `diện tích (cần ${(otherArea + wanted).toFixed(1)} m² > ${Number(floor.area_m2).toFixed(1)} m²). ` +
          `Giảm số slot của các khu loại xe này ở tầng đó trước.`,
        409,
        'CONFLICT',
      );
    }
  }
};
