import { Op } from 'sequelize';
import { Zone } from '../models/index.js';

/**
 * Sinh MÃ KHU CÓ NGHĨA, tự động theo quy ước: <FLOOR_CODE>-<VTYPE_CODE>-<NN>
 *   - FLOOR_CODE: mã tầng (F1, B1...)   → khu nằm ở tầng nào
 *   - VTYPE_CODE: mã loại xe (CAR, BIKE) → khu phục vụ loại xe gì
 *   - NN: số thứ tự 2 chữ số trong cùng (tầng, loại xe), tự tăng từ 01
 * Ví dụ: F1-CAR-01, F1-CAR-02, F1-BIKE-01, B1-CAR7-01.
 *
 * Mã do hệ thống sinh hoàn toàn (không nhập tự do) nên luôn đúng quy ước và duy nhất
 * trong tầng (khớp unique index floor_id + zone_code).
 *
 * @param {object} floor - bản ghi Floor (cần floor_id, floor_code)
 * @param {object} vehicleType - bản ghi VehicleType (cần type_code)
 * @param {{ transaction?: object, excludeZoneId?: number }} [opts]
 */
export const buildZoneCode = async (floor, vehicleType, opts = {}) => {
  const { transaction, excludeZoneId } = opts;
  const prefix = `${floor.floor_code}-${vehicleType.type_code}`;

  const where = {
    floor_id: floor.floor_id,
    zone_code: { [Op.like]: `${prefix}-%` },
  };
  if (excludeZoneId) where.zone_id = { [Op.ne]: excludeZoneId };

  // excludeZoneId: khi đang SỬA một khu, phải loại chính nó ra khỏi danh sách "anh em",
  // không thì nó tự đếm mình → mã mới nhảy lên 1 bậc dù chẳng có khu nào thêm.
  const siblings = await Zone.findAll({ where, attributes: ['zone_code'], transaction });
  let max = 0;
  for (const z of siblings) {
    const m = /-(\d+)$/.exec(z.zone_code); // lấy NN ở cuối mã
    if (m) max = Math.max(max, Number(m[1]));
  }
  // Lấy MAX + 1, KHÔNG phải count + 1: nếu có F1-CAR-01/02/03 rồi xóa 02, count+1 = 03 → ĐỤNG
  // mã đang tồn tại. max+1 = 04 ⇒ số thứ tự không bao giờ tái sử dụng, mã cũ đã in/dán ở bãi
  // không bị "hồi sinh" trỏ sang khu khác.
  return `${prefix}-${String(max + 1).padStart(2, '0')}`;
};
