-- Migration 001 — Xác minh email khi đăng ký (feature: verify email)
-- Thêm 3 cột vào bảng user_account đang có. Chạy MỘT LẦN trên DB hiện hữu,
-- vì dev tắt auto-alter (sequelize.sync không alter). Nếu cột đã tồn tại sẽ báo lỗi → bỏ qua.
--
-- Cách chạy (ví dụ):
--   mysql -h <host> -P <port> -u <user> -p <database> < server/db/migrations/001_email_verification.sql

ALTER TABLE `user_account`
  ADD COLUMN `email_verified`             TINYINT(1)   NOT NULL DEFAULT 0 AFTER `reset_token_expires`,
  ADD COLUMN `verification_token_hash`    VARCHAR(255) NULL               AFTER `email_verified`,
  ADD COLUMN `verification_token_expires` DATETIME     NULL               AFTER `verification_token_hash`;
