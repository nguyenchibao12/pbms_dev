import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

export const REFUND_STATUSES = ['pending', 'refunded', 'expired'];

/**
 * Yêu cầu HOÀN TIỀN khi user hủy vé tháng (P3-8) HOẶC hủy đặt chỗ trước cutoff (migration 006).
 * - Sinh tự động lúc hủy nếu % hoàn > 0 và vé/đơn đã thanh toán thành công.
 * - Admin xem danh sách, nhắc user cập nhật STK qua mail, chuyển khoản TAY rồi đánh dấu refunded.
 * - Quá hạn cập nhật STK (settings pass_refund_bank_info_ttl_days) → job đánh expired.
 * "Đủ điều kiện hoàn" suy ra lúc đọc từ bank_account_number của user — không lưu trạng thái
 * trung gian (đỡ lệch khi user đổi STK).
 * Tham chiếu ĐÚNG MỘT trong hai nguồn: pass_id (vé tháng) hoặc reservation_id (đặt chỗ).
 */
const RefundRequest = sequelize.define(
  'refund_request',
  {
    refund_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    pass_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    reservation_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    payment_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Payment success gốc của vé — mốc số tiền đã trả',
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    percent: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Phần trăm hoàn theo chính sách tại thời điểm hủy (100/70/50)',
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      comment: 'Số tiền hoàn = amount đã trả × percent',
    },
    status: {
      type: DataTypes.ENUM(...REFUND_STATUSES),
      allowNull: false,
      defaultValue: 'pending',
    },
    requested_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    refunded_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    refunded_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Admin đã chuyển khoản tay',
    },
    note: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Ghi chú của admin (mã giao dịch chuyển khoản...)',
    },
  },
  {
    tableName: 'refund_request',
    timestamps: true,
    hooks: {
      // Bắt buộc đúng 1 nguồn hoàn (mẫu theo hook của payment.model.js).
      beforeValidate(refund) {
        const refValue = (field) => {
          const current = refund.getDataValue(field);
          if (current != null && current !== '') return current;
          if (!refund.isNewRecord) return refund.previous(field);
          return null;
        };
        const refs = [refValue('pass_id'), refValue('reservation_id')].filter(
          (v) => v != null && v !== '',
        );
        if (refs.length !== 1) {
          throw new Error('RefundRequest must reference exactly one of pass or reservation');
        }
      },
    },
  }
);

export default RefundRequest;
