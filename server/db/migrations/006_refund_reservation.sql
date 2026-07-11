-- Migration 006 — Reservation dùng chung hạ tầng hoàn tiền của monthly pass
-- (hủy đặt chỗ trước cutoff → tạo refund_request thay vì chỉ ghi audit log;
--  bảng refund_request tham chiếu ĐÚNG MỘT trong hai: pass_id HOẶC reservation_id)
-- Chạy MỘT LẦN trên DB hiện hữu (dev tắt auto-alter).
--
-- Cách chạy:
--   mysql -h <host> -P <port> -u <user> -p <database> < server/db/migrations/006_refund_reservation.sql

ALTER TABLE `refund_request`
  MODIFY COLUMN `pass_id` INT NULL,
  ADD COLUMN `reservation_id` INT NULL AFTER `pass_id`,
  ADD CONSTRAINT `fk_refund_reservation` FOREIGN KEY (`reservation_id`)
    REFERENCES `reservation` (`reservation_id`);
