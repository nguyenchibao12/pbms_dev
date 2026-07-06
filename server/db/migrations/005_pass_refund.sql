-- Migration 005 — Hủy vé tháng + hoàn tiền thủ công (P3-8)
-- (user hủy vé → tính % hoàn theo chính sách → admin xem danh sách, nhắc cập nhật STK
--  qua email, chuyển khoản TAY rồi đánh dấu refunded; quá hạn cập nhật STK → expired)
-- Chạy MỘT LẦN trên DB hiện hữu (dev tắt auto-alter). Cột/bảng đã tồn tại sẽ báo lỗi → bỏ qua.
--
-- Cách chạy:
--   mysql -h <host> -P <port> -u <user> -p <database> < server/db/migrations/005_pass_refund.sql

-- 1) Tài khoản ngân hàng nhận hoàn tiền — user tự cập nhật ở trang profile
ALTER TABLE `user_account`
  ADD COLUMN `bank_name` VARCHAR(100) NULL AFTER `verification_token_expires`,
  ADD COLUMN `bank_account_number` VARCHAR(30) NULL AFTER `bank_name`,
  ADD COLUMN `bank_account_holder` VARCHAR(100) NULL
    COMMENT 'Tên chủ tài khoản (theo ngân hàng)' AFTER `bank_account_number`;

-- 2) Yêu cầu hoàn tiền khi hủy vé tháng
CREATE TABLE IF NOT EXISTS `refund_request` (
  `refund_id` INT NOT NULL AUTO_INCREMENT,
  `pass_id` INT NOT NULL,
  `payment_id` INT NOT NULL COMMENT 'Payment success gốc của vé — mốc số tiền đã trả',
  `user_id` INT NOT NULL,
  `percent` INT NOT NULL COMMENT 'Phần trăm hoàn theo chính sách tại thời điểm hủy (100/70/50)',
  `amount` DECIMAL(12,2) NOT NULL COMMENT 'Số tiền hoàn = amount đã trả × percent',
  `status` ENUM('pending','refunded','expired') NOT NULL DEFAULT 'pending',
  `requested_at` DATETIME NOT NULL,
  `refunded_at` DATETIME NULL,
  `refunded_by` INT NULL COMMENT 'Admin đã chuyển khoản tay',
  `note` VARCHAR(255) NULL COMMENT 'Ghi chú của admin (mã giao dịch chuyển khoản...)',
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`refund_id`),
  KEY `idx_refund_status` (`status`),
  KEY `idx_refund_user` (`user_id`),
  CONSTRAINT `fk_refund_pass` FOREIGN KEY (`pass_id`) REFERENCES `monthly_pass` (`pass_id`),
  CONSTRAINT `fk_refund_payment` FOREIGN KEY (`payment_id`) REFERENCES `payment` (`payment_id`),
  CONSTRAINT `fk_refund_user` FOREIGN KEY (`user_id`) REFERENCES `user_account` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
