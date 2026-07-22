-- Migration 009 — Bỏ 2 cột master-data không cần thiết.
--
-- 1) gate.vehicle_type_id: mỗi tầng chỉ có DUY NHẤT 1 cổng IN + 1 cổng OUT (kể cả tầng phân khu
--    nhiều loại xe vẫn dùng chung cặp cổng đó) → gán loại xe cho cổng là thừa và gây nhập sai.
--    Phải DROP FOREIGN KEY trước rồi mới DROP COLUMN (FK giữ cột lại).
-- 2) parking_slot.slot_type: bỏ hẳn khái niệm "loại chỗ" (standard/ev/disable...) — không dùng.
--
-- Chạy MỘT LẦN trên DB hiện hữu (dev tắt auto-alter):
--   mysql -h <host> -P <port> -u <user> -p <database> < server/db/migrations/009_drop_gate_vtype_slot_type.sql

ALTER TABLE `gate` DROP FOREIGN KEY `gate_ibfk_2`;
ALTER TABLE `gate` DROP COLUMN `vehicle_type_id`;

ALTER TABLE `parking_slot` DROP COLUMN `slot_type`;
