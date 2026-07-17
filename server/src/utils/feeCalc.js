import { Op } from 'sequelize';
import { PricingRule } from '../models/index.js';
import { AppError } from './helpers.js';

/**
 * LÕI TÍNH TIỀN: units = max(1, ceil(phút / unit)) × base_rate. Tính theo BLOCK, không theo phút lẻ.
 * timeIn/timeOut là tham số (không lấy giờ hiện tại) để tính lại phí phiên cũ vẫn ra đúng số.
 */
export const calculateParkingFee = (timeIn, timeOut, pricingRule) => {
  const durationMs = new Date(timeOut) - new Date(timeIn);
  // timeOut < timeIn = data hỏng (lệch đồng hồ) → thà ném lỗi hơn trả phí âm rồi cộng vào doanh thu.
  if (durationMs < 0) {
    throw new AppError('Invalid session time range', 400, 'VALIDATION_ERROR');
  }
  const durationMinutes = durationMs / (1000 * 60);
  // ceil: đỗ 61' = 2 block (bãi giữ cả block đó). max(1): sàn 1 block, chặn ca đỗ 0 phút ra 0đ.
  const units = Math.max(1, Math.ceil(durationMinutes / pricingRule.unit));
  return units * Number(pricingRule.base_rate);
};

/**
 * Bảng giá đang hiệu lực tại `atTime`. atTime là tham số chứ không hardcode new Date():
 * Manager đổi giá hôm nay thì phiên vào từ hôm qua vẫn tính giá hôm qua — đổi giá không hồi tố.
 */
export const getEffectivePricingRule = async (vehicleTypeId, atTime = new Date()) => {
  const rule = await PricingRule.findOne({
    where: {
      vehicle_type_id: vehicleTypeId,
      effective_from: { [Op.lte]: atTime },
      [Op.or]: [{ effective_to: null }, { effective_to: { [Op.gte]: atTime } }],   // null = vô hạn
    },
    // Lý thuyết chỉ khớp 1 dòng (assertNoOverlap đã chặn chồng). Vẫn sắp để data lỗi không làm
    // MySQL trả tùy hứng — cùng một phiên phải luôn ra cùng một giá.
    order: [['effective_from', 'DESC']],
  });

  if (!rule) {
    throw new AppError('No active pricing rule for this vehicle type', 404, 'NOT_FOUND');
  }

  return rule;
};
