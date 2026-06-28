-- Migration 003 — Mốc "rời tầng" cho phiên gửi xe (feat: chốt phí tại cổng tầng OUT)
-- Thêm cột left_floor_at vào bảng parking_session đang có. Chạy MỘT LẦN trên DB hiện hữu,
-- vì dev tắt auto-alter (sequelize.sync không alter). Nếu cột đã tồn tại sẽ báo lỗi → bỏ qua.
--
-- Cách chạy (ví dụ):
--   mysql -h <host> -P <port> -u <user> -p <database> < server/db/migrations/003_session_left_floor_at.sql

ALTER TABLE `parking_session`
  ADD COLUMN `left_floor_at` DATETIME NULL
    COMMENT 'Mốc xe rời tầng (quét cổng tầng OUT) — mốc chốt phí'
    AFTER `time_out`;
