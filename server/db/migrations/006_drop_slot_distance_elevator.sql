-- Migration 006 — Bỏ hẳn tính năng "khoảng cách tới thang máy" của chỗ đỗ.
-- Xóa cột distance_to_elevator khỏi bảng parking_slot. AI gợi ý slot chỉ còn dùng
-- distance_to_gate + cân bằng khu + loại xe. Chạy MỘT LẦN trên DB hiện hữu
-- (dev tắt auto-alter). Cột đã bị xóa rồi thì lệnh báo lỗi → bỏ qua.
--
-- Cách chạy (ví dụ):
--   mysql -h <host> -P <port> -u <user> -p <database> < server/db/migrations/006_drop_slot_distance_elevator.sql

ALTER TABLE `parking_slot`
  DROP COLUMN `distance_to_elevator`;
