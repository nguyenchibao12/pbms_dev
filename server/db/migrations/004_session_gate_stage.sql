-- Migration 004 — Máy trạng thái cổng cho phiên gửi xe
-- (ép đúng thứ tự qua cổng: vào tòa → vào tầng → ra tầng; + chặn vào lại bằng 1 field)
-- Chạy MỘT LẦN trên DB hiện hữu (dev tắt auto-alter). Cột đã tồn tại sẽ báo lỗi → bỏ qua.
--
-- Cách chạy:
--   mysql -h <host> -P <port> -u <user> -p <database> < server/db/migrations/004_session_gate_stage.sql

ALTER TABLE `parking_session`
  ADD COLUMN `gate_stage` ENUM('checked_in','in_building','on_floor','left_floor')
    NOT NULL DEFAULT 'checked_in'
    COMMENT 'Tiến trình qua cổng: checked_in→in_building→on_floor→left_floor'
    AFTER `time_in`;
