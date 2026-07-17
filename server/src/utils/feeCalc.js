import { Op } from 'sequelize';
import { PricingRule } from '../models/index.js';
import { AppError } from './helpers.js';

/**
 * LÕI TÍNH TIỀN của cả hệ thống — mọi con số khách phải trả đều đi qua đây.
 *
 * Công thức:  units = max(1, ceil(số phút / unit))  ·  phí = units × base_rate
 * Tính theo BLOCK (lốc) chứ không theo phút lẻ — giống gửi xe ngoài đời: `unit` là độ dài 1 block
 * (seed để 60 phút), `base_rate` là giá mỗi block.
 *
 * Hai chỗ làm tròn, đều CỐ Ý và đều có lợi cho bãi — phải giải thích được nếu bị hỏi:
 *  · `ceil`   — block lẻ tính tròn 1 block: đỗ 61 phút = 2 block, không phải 1.02. Bãi giữ chỗ
 *               cả block đó, khách khác không dùng được, nên tính đủ.
 *  · `max(1)` — SÀN 1 block: ghé 2 phút vẫn trả 1 block. Không có sàn thì `ceil(2/60)` = 1 (vẫn ổn),
 *               nhưng đỗ ĐÚNG 0 phút (vào ra tức thì / lỗi quét) sẽ ra 0đ ⇒ đây là chốt chặn cho ca đó.
 *
 * Không tự lấy giờ hiện tại: `timeIn`/`timeOut` do bên gọi truyền vào, để tính lại phí của phiên
 * trong quá khứ vẫn ra đúng con số. Xem `completeSessionAfterPayment` — nơi DUY NHẤT ghi `time_out`.
 */
export const calculateParkingFee = (timeIn, timeOut, pricingRule) => {
  const durationMs = new Date(timeOut) - new Date(timeIn);
  // timeOut < timeIn = data hỏng (lệch đồng hồ, truyền nhầm thứ tự). Thà ném lỗi còn hơn trả phí âm
  // rồi cộng vào doanh thu.
  if (durationMs < 0) {
    throw new AppError('Invalid session time range', 400, 'VALIDATION_ERROR');
  }
  const durationMinutes = durationMs / (1000 * 60);
  const units = Math.max(1, Math.ceil(durationMinutes / pricingRule.unit));
  return units * Number(pricingRule.base_rate);
};

/**
 * Chọn bảng giá ĐANG hiệu lực tại một thời điểm: `effective_from ≤ atTime ≤ effective_to`
 * (`effective_to = null` = còn hiệu lực mãi, xem `pricingRule.service.js`).
 *
 * `atTime` là THAM SỐ chứ không hardcode `new Date()`: Manager đổi giá hôm nay thì phiên xe vào
 * từ hôm qua vẫn phải tính theo giá HÔM QUA. Truyền thời điểm vào ⇒ đổi giá không hồi tố.
 */
export const getEffectivePricingRule = async (vehicleTypeId, atTime = new Date()) => {
  const rule = await PricingRule.findOne({
    where: {
      vehicle_type_id: vehicleTypeId,
      effective_from: { [Op.lte]: atTime },
      [Op.or]: [{ effective_to: null }, { effective_to: { [Op.gte]: atTime } }],
    },
    // Về lý thuyết chỉ khớp 1 dòng (`assertNoOverlap` đã chặn 2 bảng giá chồng khoảng). Vẫn sắp xếp
    // để nếu data cũ/lỗi có chồng thì lấy bảng giá MỚI NHẤT — phải chọn một đáp án xác định, không
    // để MySQL trả tùy hứng khiến cùng một phiên mỗi lần tính ra một giá.
    order: [['effective_from', 'DESC']],
  });

  if (!rule) {
    throw new AppError('No active pricing rule for this vehicle type', 404, 'NOT_FOUND');
  }

  return rule;
};
