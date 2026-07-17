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
 * Luật: CÀNG XA MẶT ĐẤT DIỆN TÍCH CÀNG KHÔNG ĐƯỢC LỚN HƠN — chặn tòa nhà "phình". Tầng nổi (level ≥ 0)
 * và hầm (level < 0) là HAI chuỗi RIÊNG, không ràng buộc chéo: hầm nhỏ hơn tháp (hầm một phần) là kiểu
 * xây có thật — phần trệt không nằm trên hầm thì nằm trên nền móng. Nổi: lên cao không rộng ra
 * (F1≥F2≥F3). Hầm: đào sâu không rộng ra (B1≥B2≥B3). Chỉ so tầng liền kề (quy nạp, vì mọi đường ghi
 * tầng đều gọi hàm này).
 */
export const assertFloorAreaMonotonic = async (
  { floorLevel, areaM2, excludeFloorId } = {},
  transaction,
) => {
  if (areaM2 == null) return;                          // tầng NULL = không giới hạn → không có số để so
  const area = Number(areaM2);
  const level = Number(floorLevel);
  const isBasement = level < 0;                        // hầm và nổi/trệt là 2 chuỗi tách nhau tại mặt đất
  // Đang SỬA tầng này → loại nó ra, không thì nó tự so với chính mình (bản cũ).
  const notSelf = excludeFloorId ? { floor_id: { [Op.ne]: Number(excludeFloorId) } } : {};
  // Op.not = IS NOT NULL. Dùng nhầm Op.ne thì SQL ra `x != NULL` (không bao giờ đúng) → guard tê liệt.
  const hasArea = { area_m2: { [Op.not]: null } };
  // Giữ trong CÙNG chuỗi: hầm chỉ so hầm (<0), nổi/trệt chỉ so nổi/trệt (≥0).
  const sameSide = isBasement ? { [Op.lt]: 0 } : { [Op.gte]: 0 };

  // Hàng xóm GẦN mặt đất hơn: nổi = level nhỏ hơn (tầng dưới), hầm = level lớn hơn (hầm nông hơn).
  const inner = await Floor.findOne({
    where: {
      ...notSelf, ...hasArea,
      [Op.and]: [{ floor_level: sameSide }, { floor_level: isBasement ? { [Op.gt]: level } : { [Op.lt]: level } }],
    },
    order: [['floor_level', isBasement ? 'ASC' : 'DESC']],   // lấy tầng SÁT mình nhất về phía mặt đất
    transaction,
  });
  if (inner && area > Number(inner.area_m2) + 1e-6) {  // mình rộng hơn tầng gần mặt đất hơn ⇒ phình ⇒ chặn
    throw new AppError(
      `Tầng ở cao độ ${level} (${area.toFixed(1)} m²) rộng hơn ` +
        `${isBasement ? 'hầm nông hơn' : 'tầng dưới'} "${inner.label || inner.floor_code}" ` +
        `(${Number(inner.area_m2).toFixed(1)} m²). ` +
        `${isBasement ? 'Hầm đào sâu không được rộng hơn hầm nông.' : 'Diện tích sàn không được tăng khi lên cao.'}`,
      409,
      'CONFLICT',
    );
  }

  // Phải kiểm CẢ hàng xóm XA mặt đất hơn vì tầng mới có thể CHÈN VÀO GIỮA (chèn tầng rộng vào giữa sẽ lọt).
  const outer = await Floor.findOne({
    where: {
      ...notSelf, ...hasArea,
      [Op.and]: [{ floor_level: sameSide }, { floor_level: isBasement ? { [Op.lt]: level } : { [Op.gt]: level } }],
    },
    order: [['floor_level', isBasement ? 'DESC' : 'ASC']],   // lấy tầng SÁT mình nhất về phía xa mặt đất
    transaction,
  });
  if (outer && Number(outer.area_m2) > area + 1e-6) {  // tầng xa mặt đất hơn rộng hơn mình ⇒ cũng phình ⇒ chặn
    throw new AppError(
      `Tầng ở cao độ ${level} (${area.toFixed(1)} m²) hẹp hơn ` +
        `${isBasement ? 'hầm sâu hơn' : 'tầng trên'} "${outer.label || outer.floor_code}" ` +
        `(${Number(outer.area_m2).toFixed(1)} m²). ` +
        `${isBasement ? 'Hầm đào sâu không được rộng hơn hầm nông.' : 'Diện tích sàn không được tăng khi lên cao.'}`,
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
