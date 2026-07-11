-- Migration 007 — Ghi NGƯỜI XỬ LÝ sự cố.
-- Thêm resolved_by (Manager/Admin đã xử lý) + resolved_at (thời điểm xử lý) vào bảng incident.
-- Khi đổi trạng thái sang 'resolved' → BE ghi 2 cột này; mở lại → xóa. Phục vụ truy vết
-- "ai xử lý sự cố lố giờ / mất vé". Chạy MỘT LẦN trên DB hiện hữu (dev tắt auto-alter).
-- Cột đã tồn tại thì lệnh báo lỗi → bỏ qua.
--
-- Cách chạy (ví dụ):
--   mysql -h <host> -P <port> -u <user> -p <database> < server/db/migrations/007_incident_resolved_by.sql

ALTER TABLE `incident`
  ADD COLUMN `resolved_by` INT NULL COMMENT 'Manager/Admin who resolved the incident' AFTER `status`,
  ADD COLUMN `resolved_at` DATETIME NULL COMMENT 'When the incident was marked resolved' AFTER `resolved_by`;
