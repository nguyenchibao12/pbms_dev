-- =====================================================================
--  PBMS — Parking Building Management System (SU26SWP08)
--  MySQL 8 schema — khớp 1-1 với Sequelize models (server/src/models/*)
--
--  CÁCH IMPORT:
--    mysql -u root -p < server/db/schema.sql
--  hoặc trong MySQL Workbench: mở file này rồi Run (Execute SQL Script).
--
--  Lưu ý:
--    - Charset utf8mb4 để lưu tiếng Việt / emoji.
--    - File này TẠO LẠI toàn bộ bảng (DROP IF EXISTS) — chạy trên DB trống.
--    - App khi chạy dev vẫn tự sync (không alter) + tự tạo 4 role và bản ghi
--      setting mặc định; phần seed cuối file chỉ để DB dùng được ngay cả khi
--      chưa chạy app.
--    - DATE (Sequelize) -> DATETIME, DATEONLY -> DATE, TIME -> TIME,
--      BOOLEAN -> TINYINT(1), DECIMAL giữ nguyên precision.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `pbms`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `pbms`;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `setting`;
DROP TABLE IF EXISTS `audit_log`;
DROP TABLE IF EXISTS `incident`;
DROP TABLE IF EXISTS `ai_log`;
DROP TABLE IF EXISTS `payment`;
DROP TABLE IF EXISTS `parking_session`;
DROP TABLE IF EXISTS `monthly_pass`;
DROP TABLE IF EXISTS `reservation`;
DROP TABLE IF EXISTS `pricing_rule`;
DROP TABLE IF EXISTS `gate`;
DROP TABLE IF EXISTS `parking_slot`;
DROP TABLE IF EXISTS `zone`;
DROP TABLE IF EXISTS `user_account`;
DROP TABLE IF EXISTS `floor`;
DROP TABLE IF EXISTS `vehicle_type`;
DROP TABLE IF EXISTS `role`;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 1) role
-- ---------------------------------------------------------------------
CREATE TABLE `role` (
  `role_id`    INT          NOT NULL AUTO_INCREMENT,
  `role_name`  VARCHAR(50)  NOT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `uq_role_name` (`role_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2) vehicle_type
-- ---------------------------------------------------------------------
CREATE TABLE `vehicle_type` (
  `vehicle_type_id` INT         NOT NULL AUTO_INCREMENT,
  `type_name`       VARCHAR(50) NOT NULL,
  `type_code`       VARCHAR(20) NOT NULL,
  `created_at`      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`vehicle_type_id`),
  UNIQUE KEY `uq_vehicle_type_code` (`type_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3) floor
-- ---------------------------------------------------------------------
CREATE TABLE `floor` (
  `floor_id`    INT          NOT NULL AUTO_INCREMENT,
  `floor_code`  VARCHAR(20)  NOT NULL,
  `floor_level` INT          NOT NULL,
  `label`       VARCHAR(100) NOT NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`floor_id`),
  UNIQUE KEY `uq_floor_code` (`floor_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4) user_account
-- ---------------------------------------------------------------------
CREATE TABLE `user_account` (
  `user_id`       INT          NOT NULL AUTO_INCREMENT,
  `role_id`       INT          NOT NULL,
  `username`      VARCHAR(50)  NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `full_name`     VARCHAR(100) NOT NULL,
  `phone`               VARCHAR(20)  NULL,
  `email`               VARCHAR(100) NULL,
  `is_active`           TINYINT(1)   NOT NULL DEFAULT 1,
  `auth_provider`       VARCHAR(20)  NOT NULL DEFAULT 'local' COMMENT 'local | google',
  `google_id`           VARCHAR(64)  NULL,
  `reset_token_hash`    VARCHAR(255) NULL COMMENT 'SHA-256 token reset mật khẩu',
  `reset_token_expires` DATETIME     NULL,
  `email_verified`             TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'Đã xác minh email chưa',
  `verification_token_hash`    VARCHAR(255) NULL COMMENT 'SHA-256 của token xác minh email',
  `verification_token_expires` DATETIME     NULL,
  `created_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_user_username` (`username`),
  UNIQUE KEY `uq_user_email` (`email`),
  UNIQUE KEY `uq_user_google_id` (`google_id`),
  KEY `idx_user_role` (`role_id`),
  CONSTRAINT `fk_user_role` FOREIGN KEY (`role_id`)
    REFERENCES `role` (`role_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5) zone  (vehicle_type gắn ở cấp zone — A2)
-- ---------------------------------------------------------------------
CREATE TABLE `zone` (
  `zone_id`               INT          NOT NULL AUTO_INCREMENT,
  `floor_id`              INT          NOT NULL,
  `vehicle_type_id`       INT          NOT NULL,
  `zone_code`             VARCHAR(20)  NOT NULL,
  `label`                 VARCHAR(100) NOT NULL,
  `total_slots`           INT          NOT NULL DEFAULT 0,
  `monthly_pass_capacity` INT          NOT NULL DEFAULT 0
                          COMMENT 'OR-03: số slot tối đa dành cho vé tháng trong khu',
  `created_at`            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`zone_id`),
  UNIQUE KEY `uq_zone_floor_code` (`floor_id`, `zone_code`),
  KEY `idx_zone_vehicle_type` (`vehicle_type_id`),
  CONSTRAINT `fk_zone_floor` FOREIGN KEY (`floor_id`)
    REFERENCES `floor` (`floor_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_zone_vehicle_type` FOREIGN KEY (`vehicle_type_id`)
    REFERENCES `vehicle_type` (`vehicle_type_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 6) parking_slot
-- ---------------------------------------------------------------------
CREATE TABLE `parking_slot` (
  `slot_id`          INT           NOT NULL AUTO_INCREMENT,
  `zone_id`          INT           NOT NULL,
  `slot_code`        VARCHAR(20)   NOT NULL,
  `status`           ENUM('available','reserved','occupied','maintenance','locked')
                     NOT NULL DEFAULT 'available',
  `slot_type`        VARCHAR(50)   NULL,
  `distance_to_gate`      DECIMAL(10,2) NULL,
  `distance_to_elevator`  DECIMAL(10,2) NULL COMMENT 'Khoảng cách tới thang máy/lối ra (m)',
  `created_at`            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`slot_id`),
  UNIQUE KEY `uq_slot_zone_code` (`zone_id`, `slot_code`),
  CONSTRAINT `fk_slot_zone` FOREIGN KEY (`zone_id`)
    REFERENCES `zone` (`zone_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 7) gate
-- ---------------------------------------------------------------------
CREATE TABLE `gate` (
  `gate_id`         INT         NOT NULL AUTO_INCREMENT,
  `floor_id`        INT         NOT NULL,
  `gate_code`       VARCHAR(20) NOT NULL,
  `direction`       ENUM('in','out') NOT NULL,
  `vehicle_type_id` INT         NULL
                    COMMENT 'NULL = mọi loại xe; nên gán riêng ô tô / xe máy',
  `label`           VARCHAR(80) NULL,
  `is_active`       TINYINT(1)  NOT NULL DEFAULT 1,
  `created_at`      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`gate_id`),
  UNIQUE KEY `uq_gate_floor_code` (`floor_id`, `gate_code`),
  KEY `idx_gate_vehicle_type` (`vehicle_type_id`),
  CONSTRAINT `fk_gate_floor` FOREIGN KEY (`floor_id`)
    REFERENCES `floor` (`floor_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_gate_vehicle_type` FOREIGN KEY (`vehicle_type_id`)
    REFERENCES `vehicle_type` (`vehicle_type_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 8) pricing_rule  (OR-05: phí = CEIL(duration/unit) * base_rate)
-- ---------------------------------------------------------------------
CREATE TABLE `pricing_rule` (
  `pricing_rule_id` INT           NOT NULL AUTO_INCREMENT,
  `vehicle_type_id` INT           NOT NULL,
  `unit`            INT           NOT NULL COMMENT 'Billing unit in minutes',
  `base_rate`       DECIMAL(12,2) NOT NULL,
  `effective_from`  DATETIME      NOT NULL,
  `effective_to`    DATETIME      NULL,
  `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`pricing_rule_id`),
  KEY `idx_pricing_vehicle_type` (`vehicle_type_id`),
  CONSTRAINT `fk_pricing_vehicle_type` FOREIGN KEY (`vehicle_type_id`)
    REFERENCES `vehicle_type` (`vehicle_type_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 9) reservation  (OR-02: khóa slot 'reserved' khi đặt)
-- ---------------------------------------------------------------------
CREATE TABLE `reservation` (
  `reservation_id`   INT         NOT NULL AUTO_INCREMENT,
  `user_id`          INT         NOT NULL,
  `vehicle_type_id`  INT         NOT NULL,
  `floor_id`         INT         NOT NULL,
  `zone_id`          INT         NOT NULL,
  `slot_id`          INT         NOT NULL,
  `plate_number`     VARCHAR(20) NOT NULL,
  `start_time`       DATETIME    NOT NULL,
  `end_time`         DATETIME    NOT NULL,
  `status`           ENUM('pending','confirmed','checked_in','completed','cancelled','no_show')
                     NOT NULL DEFAULT 'pending',
  `reservation_type` VARCHAR(30) NOT NULL DEFAULT 'standard',
  `qr_token`         VARCHAR(64) NULL,
  `created_at`       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`reservation_id`),
  UNIQUE KEY `uq_reservation_qr` (`qr_token`),
  KEY `idx_reservation_user` (`user_id`),
  KEY `idx_reservation_slot` (`slot_id`),
  KEY `idx_reservation_status` (`status`),
  CONSTRAINT `fk_reservation_user` FOREIGN KEY (`user_id`)
    REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_reservation_vehicle_type` FOREIGN KEY (`vehicle_type_id`)
    REFERENCES `vehicle_type` (`vehicle_type_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_reservation_floor` FOREIGN KEY (`floor_id`)
    REFERENCES `floor` (`floor_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_reservation_zone` FOREIGN KEY (`zone_id`)
    REFERENCES `zone` (`zone_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_reservation_slot` FOREIGN KEY (`slot_id`)
    REFERENCES `parking_slot` (`slot_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 10) monthly_pass  (OR-03: khóa capacity, không khóa slot cứng)
-- ---------------------------------------------------------------------
CREATE TABLE `monthly_pass` (
  `pass_id`         INT         NOT NULL AUTO_INCREMENT,
  `user_id`         INT         NOT NULL,
  `vehicle_type_id` INT         NOT NULL,
  `floor_id`        INT         NOT NULL,
  `plate_number`    VARCHAR(20) NOT NULL,
  `valid_from_time` TIME        NOT NULL,
  `valid_to_time`   TIME        NOT NULL,
  `start_date`      DATE        NOT NULL,
  `end_date`        DATE        NOT NULL,
  `status`          ENUM('pending','active','expired','cancelled')
                    NOT NULL DEFAULT 'pending',
  `qr_token`        VARCHAR(64) NULL,
  `created_at`      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`pass_id`),
  UNIQUE KEY `uq_pass_qr` (`qr_token`),
  KEY `idx_pass_user` (`user_id`),
  KEY `idx_pass_status` (`status`),
  CONSTRAINT `fk_pass_user` FOREIGN KEY (`user_id`)
    REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_pass_vehicle_type` FOREIGN KEY (`vehicle_type_id`)
    REFERENCES `vehicle_type` (`vehicle_type_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_pass_floor` FOREIGN KEY (`floor_id`)
    REFERENCES `floor` (`floor_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 11) parking_session  (lõi hệ thống)
--     qr_token UNIQUE + vô hiệu hóa sau check-out (DV-05)
--     idx (plate_number,status) chống double check-in (DV-06)
-- ---------------------------------------------------------------------
CREATE TABLE `parking_session` (
  `session_id`      INT           NOT NULL AUTO_INCREMENT,
  `user_id`         INT           NULL,
  `reservation_id`  INT           NULL,
  `pass_id`         INT           NULL,
  `gate_id`         INT           NOT NULL COMMENT 'Cổng VÀO (entry gate)',
  `exit_gate_id`    INT           NULL COMMENT 'Cổng RA (exit gate) — ghi lúc check-out',
  `slot_id`         INT           NOT NULL,
  `vehicle_type_id` INT           NOT NULL,
  `plate_number`    VARCHAR(20)   NOT NULL,
  `time_in`         DATETIME      NOT NULL,
  `time_out`        DATETIME      NULL,
  `qr_token`        VARCHAR(64)   NOT NULL,
  `check_in_by`     INT           NOT NULL,
  `check_out_by`    INT           NULL,
  `session_type`    ENUM('walk_in','reservation','monthly_pass','auto_registered') NOT NULL,
  `status`          ENUM('active','completed','exception') NOT NULL DEFAULT 'active',
  `calculated_fee`  DECIMAL(12,2) NULL,
  `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`session_id`),
  UNIQUE KEY `uq_session_qr` (`qr_token`),
  KEY `idx_session_plate_status` (`plate_number`, `status`),
  KEY `idx_session_status` (`status`),
  KEY `idx_session_gate` (`gate_id`),
  KEY `idx_session_exit_gate` (`exit_gate_id`),
  KEY `idx_session_slot` (`slot_id`),
  KEY `idx_session_reservation` (`reservation_id`),
  KEY `idx_session_pass` (`pass_id`),
  CONSTRAINT `fk_session_user` FOREIGN KEY (`user_id`)
    REFERENCES `user_account` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_session_reservation` FOREIGN KEY (`reservation_id`)
    REFERENCES `reservation` (`reservation_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_session_pass` FOREIGN KEY (`pass_id`)
    REFERENCES `monthly_pass` (`pass_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_session_gate` FOREIGN KEY (`gate_id`)
    REFERENCES `gate` (`gate_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_session_exit_gate` FOREIGN KEY (`exit_gate_id`)
    REFERENCES `gate` (`gate_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_session_slot` FOREIGN KEY (`slot_id`)
    REFERENCES `parking_slot` (`slot_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_session_vehicle_type` FOREIGN KEY (`vehicle_type_id`)
    REFERENCES `vehicle_type` (`vehicle_type_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_session_checkin_by` FOREIGN KEY (`check_in_by`)
    REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_session_checkout_by` FOREIGN KEY (`check_out_by`)
    REFERENCES `user_account` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 12) payment  (OR-11: chỉ gắn ĐÚNG 1 trong session/reservation/pass —
--     ràng buộc này enforce ở Service/Model hook, không phải CHECK ở DB)
-- ---------------------------------------------------------------------
CREATE TABLE `payment` (
  `payment_id`             INT           NOT NULL AUTO_INCREMENT,
  `session_id`             INT           NULL,
  `reservation_id`         INT           NULL,
  `pass_id`                INT           NULL,
  `order_code`             BIGINT        NOT NULL,
  `gateway_transaction_id` VARCHAR(100)  NULL,
  `gateway_response`       TEXT          NULL,
  `amount`                 DECIMAL(12,2) NOT NULL,
  `status`                 ENUM('pending','success','failed','refunded')
                           NOT NULL DEFAULT 'pending',
  `method`                 VARCHAR(30)   NOT NULL DEFAULT 'payos',
  `paid_at`                DATETIME      NULL,
  `created_at`             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  UNIQUE KEY `uq_payment_order_code` (`order_code`),
  KEY `idx_payment_session` (`session_id`),
  KEY `idx_payment_reservation` (`reservation_id`),
  KEY `idx_payment_pass` (`pass_id`),
  KEY `idx_payment_status` (`status`),
  CONSTRAINT `fk_payment_session` FOREIGN KEY (`session_id`)
    REFERENCES `parking_session` (`session_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_payment_reservation` FOREIGN KEY (`reservation_id`)
    REFERENCES `reservation` (`reservation_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_payment_pass` FOREIGN KEY (`pass_id`)
    REFERENCES `monthly_pass` (`pass_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 13) ai_log  (OR-04/OR-20: log mỗi lần gợi ý slot — chỉ có cột create_at)
-- ---------------------------------------------------------------------
CREATE TABLE `ai_log` (
  `log_id`           INT         NOT NULL AUTO_INCREMENT,
  `session_id`       INT         NULL,
  `algorithm_used`   VARCHAR(50) NOT NULL,
  `candidates_count` INT         NOT NULL DEFAULT 0,
  `selected_slot_id` INT         NOT NULL,
  `executed_time_ms` INT         NOT NULL DEFAULT 0,
  `floor_id`         INT         NULL,
  `vehicle_type_id`  INT         NULL,
  `context`          VARCHAR(30) NULL,
  `create_at`        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_ailog_session` (`session_id`),
  KEY `idx_ailog_slot` (`selected_slot_id`),
  CONSTRAINT `fk_ailog_session` FOREIGN KEY (`session_id`)
    REFERENCES `parking_session` (`session_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ailog_slot` FOREIGN KEY (`selected_slot_id`)
    REFERENCES `parking_slot` (`slot_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 14) incident  (OR-15: sự cố ngoại lệ; type=feedback dùng cột category)
-- ---------------------------------------------------------------------
CREATE TABLE `incident` (
  `incident_id`    INT  NOT NULL AUTO_INCREMENT,
  `session_id`     INT  NULL,
  `slot_id`        INT  NULL,
  `user_id`        INT  NULL,
  `reservation_id` INT  NULL,
  `pass_id`        INT  NULL,
  `reported_by`    INT  NULL COMMENT 'Staff/Admin who reported the incident',
  `description`    TEXT NOT NULL,
  `type`           ENUM('wrong_floor','duplicate_session','window_violation','slot_conflict',
                        'lost_ticket','wrong_info','overstay','wrong_zone','feedback','other')
                   NOT NULL DEFAULT 'other',
  `category`       ENUM('lost_card','wrong_fee','hard_to_find','slot_taken','other')
                   NULL COMMENT 'Feedback category when type=feedback',
  `status`         ENUM('open','investigating','resolved') NOT NULL DEFAULT 'open',
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`incident_id`),
  KEY `idx_incident_status` (`status`),
  KEY `idx_incident_type` (`type`),
  KEY `idx_incident_session` (`session_id`),
  CONSTRAINT `fk_incident_session` FOREIGN KEY (`session_id`)
    REFERENCES `parking_session` (`session_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_incident_slot` FOREIGN KEY (`slot_id`)
    REFERENCES `parking_slot` (`slot_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_incident_user` FOREIGN KEY (`user_id`)
    REFERENCES `user_account` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_incident_reservation` FOREIGN KEY (`reservation_id`)
    REFERENCES `reservation` (`reservation_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_incident_pass` FOREIGN KEY (`pass_id`)
    REFERENCES `monthly_pass` (`pass_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_incident_reported_by` FOREIGN KEY (`reported_by`)
    REFERENCES `user_account` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 15) audit_log  (AR-09: ghi vết hành động Admin — chỉ có created_at)
-- ---------------------------------------------------------------------
CREATE TABLE `audit_log` (
  `log_id`     INT         NOT NULL AUTO_INCREMENT,
  `actor_id`   INT         NOT NULL,
  `action`     VARCHAR(80) NOT NULL,
  `details`    TEXT        NULL COMMENT 'JSON payload',
  `created_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_audit_actor` (`actor_id`),
  CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_id`)
    REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 16) setting  (1 hàng duy nhất, setting_id = 1)
-- ---------------------------------------------------------------------
CREATE TABLE `setting` (
  `setting_id`      INT      NOT NULL DEFAULT 1,
  `building_config` TEXT     NULL
                    COMMENT 'JSON: building_name, address, phone, is_24_7, open_time, close_time',
  `system_config`   TEXT     NULL
                    COMMENT 'JSON: booking_fee, monthly_pass_price, lost_ticket_fee, slot_suggest_strategy, ai_logging_enabled',
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  SEED TỐI THIỂU (reference data — app cũng tự tạo khi khởi động)
-- =====================================================================

-- 4 role cho RBAC + đăng ký (User mặc định)
INSERT INTO `role` (`role_name`) VALUES
  ('Admin'), ('Manager'), ('Staff'), ('User');

-- 2 loại xe gợi ý (tùy chọn — Manager có thể sửa/thêm trong UI)
INSERT INTO `vehicle_type` (`type_name`, `type_code`) VALUES
  ('Ô tô', 'CAR'),
  ('Xe máy', 'MOTORBIKE');

-- Bản ghi setting mặc định (app sẽ ghi đè bằng giá trị từ .env khi khởi động)
INSERT INTO `setting` (`setting_id`, `building_config`, `system_config`) VALUES
  (1, NULL, NULL);

-- =====================================================================
--  Sau khi import: tạo tài khoản Admin đầu tiên bằng app (mật khẩu được hash):
--    npm run create-admin --prefix server -- <username> <password> "Họ tên" email@domain
--  KHÔNG insert user trực tiếp vào DB vì password_hash phải do bcrypt sinh.
-- =====================================================================
