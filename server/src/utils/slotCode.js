import { Op } from 'sequelize';
import { ParkingSlot } from '../models/index.js';

/**
 * Sinh MÃ CHỖ ĐỖ CÓ NGHĨA, tự động theo quy ước: <ZONE_CODE>-<NN>
 *   - ZONE_CODE: mã khu (đã có nghĩa, vd F1-CAR-01) → chỗ thuộc khu nào
 *   - NN: số thứ tự 2 chữ số trong khu, tự tăng từ 01
 * Ví dụ: F1-CAR-01-01, F1-CAR-01-02, F3-BIKE-01-07.
 *
 * Mã do hệ thống sinh hoàn toàn (không nhập tự do) nên luôn duy nhất trong khu
 * (khớp unique index zone_id + slot_code) và mang nghĩa toàn cục.
 *
 * Vì mã chỗ ĐẺ RA TỪ mã khu, đổi mã khu là mã chỗ con phải sinh lại theo — xem
 * `resyncZoneSlotCodes` (parkingSlot.service.js), gọi khi tầng single đổi loại xe.
 * Đó là cái giá của "mã có nghĩa": bù lại, nhìn F1-CAR-01-07 là biết ngay tầng 1, khu ô tô,
 * chỗ số 7 — không phải tra DB.
 */

export const slotCodePrefix = (zone) => `${zone.zone_code}-`;

export const buildSlotCode = (zone, n) =>
  `${slotCodePrefix(zone)}${String(n).padStart(2, '0')}`;

/** NN lớn nhất hiện có trong khu (theo prefix mã khu); 0 nếu chưa có chỗ nào hợp quy ước. */
export const maxSlotNumber = async (zone, { transaction } = {}) => {
  const rows = await ParkingSlot.findAll({
    where: { zone_id: zone.zone_id, slot_code: { [Op.like]: `${slotCodePrefix(zone)}%` } },
    attributes: ['slot_code'],
    transaction,
  });
  let max = 0;
  for (const r of rows) {
    const m = /-(\d+)$/.exec(r.slot_code); // lấy NN ở cuối mã
    if (m) max = Math.max(max, Number(m[1]));
  }
  // MAX chứ không phải COUNT — xóa chỗ giữa (vd -02) rồi tạo mới thì count+1 sẽ đụng mã đang có.
  // Lọc theo prefix mã khu nên chỗ nào mã cũ không hợp quy ước (legacy) bị bỏ qua, không phá số đếm.
  return max;
};

/** Mã chỗ kế tiếp của khu (dùng cho tạo lẻ + xem trước). */
export const nextSlotCode = async (zone, opts = {}) =>
  buildSlotCode(zone, (await maxSlotNumber(zone, opts)) + 1);
