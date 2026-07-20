-- Migration 008 — Reservation chuyển sang MÔ HÌNH SỨC CHỨA (như vé tháng).
-- Đặt chỗ = giữ MỘT SUẤT trong khung giờ (đếm số đơn trùng khung so với sức chứa tầng),
-- KHÔNG ghim slot cụ thể nữa; slot thật được gán lúc CHECK-IN (kiểu vé tháng).
-- 1) slot_id/zone_id thành NULLABLE: đơn mới tạo không có slot; zone_id chỉ là "ưu tiên".
-- 2) Null hóa pin của đơn pending/confirmed CŨ: pin không còn được enforce ở đâu nữa,
--    giữ lại chỉ gây hiểu nhầm (holdback + gán-lúc-check-in bảo vệ các đơn này).
-- 3) Trả mọi slot 'reserved' về 'available': cờ reserved bị khai tử, job quét dọn (Ca C)
--    đã gỡ — không dọn thì cờ mồ côi giấu slot khỏi walk-in vĩnh viễn.
-- Chạy MỘT LẦN trên DB hiện hữu (dev tắt auto-alter). Cột đã NULL sẵn thì ALTER vô hại.
--
-- Cách chạy (ví dụ):
--   mysql -h <host> -P <port> -u <user> -p <database> < server/db/migrations/008_reservation_capacity.sql

ALTER TABLE `reservation`
  MODIFY `slot_id` INT NULL,
  MODIFY `zone_id` INT NULL;

UPDATE `reservation` SET `slot_id` = NULL WHERE `status` IN ('pending', 'confirmed');

UPDATE `parking_slot` SET `status` = 'available' WHERE `status` = 'reserved';
