-- PBMS — Parking Building Management System (SU26SWP08)
-- Nền tảng: bảng vai trò (role) + tài khoản người dùng (user_account).
-- Tương thích Sequelize (underscored, created_at/updated_at). InnoDB / utf8mb4.
--
-- Lưu ý: khi chạy dev, Sequelize tự tạo bảng (syncSchema). File này để team
-- import nhanh hoặc tham khảo cấu trúc khi dựng DB tay.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Vai trò: Admin / Manager / Staff / User (seed tự động lúc khởi động qua ensureRoles)
CREATE TABLE IF NOT EXISTS `role` (
  `role_id`    INT NOT NULL AUTO_INCREMENT,
  `role_name`  VARCHAR(50) NOT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `uq_role_name` (`role_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tài khoản người dùng. Hỗ trợ đăng nhập local + Google, và token reset mật khẩu.
CREATE TABLE IF NOT EXISTS `user_account` (
  `user_id`             INT NOT NULL AUTO_INCREMENT,
  `role_id`             INT NOT NULL,
  `username`            VARCHAR(50) NOT NULL,
  `password_hash`       VARCHAR(255) NOT NULL,
  `full_name`           VARCHAR(100) NOT NULL,
  `phone`               VARCHAR(20) NULL,
  `email`               VARCHAR(100) NULL,
  `is_active`           TINYINT(1) NOT NULL DEFAULT 1,
  `auth_provider`       VARCHAR(20) NOT NULL DEFAULT 'local' COMMENT 'local | google',
  `google_id`           VARCHAR(64) NULL,
  `reset_token_hash`    VARCHAR(255) NULL COMMENT 'SHA-256 của token reset mật khẩu',
  `reset_token_expires` DATETIME NULL,
  `created_at`          DATETIME NOT NULL,
  `updated_at`          DATETIME NOT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_user_username` (`username`),
  UNIQUE KEY `uq_user_email` (`email`),
  UNIQUE KEY `uq_user_google_id` (`google_id`),
  KEY `idx_user_role` (`role_id`),
  CONSTRAINT `fk_user_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Loại phương tiện: Ô tô / Xe máy. Master data dùng cho zone, pricing, session...
CREATE TABLE IF NOT EXISTS `vehicle_type` (
  `vehicle_type_id` INT NOT NULL AUTO_INCREMENT,
  `type_name`       VARCHAR(50) NOT NULL,
  `type_code`       VARCHAR(20) NOT NULL,
  `created_at`      DATETIME NOT NULL,
  `updated_at`      DATETIME NOT NULL,
  PRIMARY KEY (`vehicle_type_id`),
  UNIQUE KEY `uq_vehicle_type_code` (`type_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tầng (floor) trong tòa nhà
CREATE TABLE IF NOT EXISTS `floor` (
  `floor_id`    INT          NOT NULL AUTO_INCREMENT,
  `floor_code`  VARCHAR(20)  NOT NULL,
  `floor_level` INT          NOT NULL,
  `label`       VARCHAR(100) NOT NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`floor_id`),
  UNIQUE KEY `uq_floor_code` (`floor_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Khu (zone) — gắn loại xe ở cấp zone (A2)
CREATE TABLE IF NOT EXISTS `zone` (
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

-- Chỗ đỗ (parking_slot)
CREATE TABLE IF NOT EXISTS `parking_slot` (
  `slot_id`              INT           NOT NULL AUTO_INCREMENT,
  `zone_id`              INT           NOT NULL,
  `slot_code`            VARCHAR(20)   NOT NULL,
  `status`               ENUM('available','reserved','occupied','maintenance','locked')
                         NOT NULL DEFAULT 'available',
  `slot_type`            VARCHAR(50)   NULL,
  `distance_to_gate`     DECIMAL(10,2) NULL,
  `distance_to_elevator` DECIMAL(10,2) NULL COMMENT 'Khoảng cách tới thang máy/lối ra (m)',
  `created_at`           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`slot_id`),
  UNIQUE KEY `uq_slot_zone_code` (`zone_id`, `slot_code`),
  CONSTRAINT `fk_slot_zone` FOREIGN KEY (`zone_id`)
    REFERENCES `zone` (`zone_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cổng (gate) vào/ra theo tầng
CREATE TABLE IF NOT EXISTS `gate` (
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

-- Bảng giá (pricing_rule) — OR-05: phí = CEIL(duration/unit) * base_rate
CREATE TABLE IF NOT EXISTS `pricing_rule` (
  `pricing_rule_id` INT           NOT NULL AUTO_INCREMENT,
  `vehicle_type_id` INT           NOT NULL,
  `unit`            INT           NOT NULL COMMENT 'Đơn vị tính phí (phút)',
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

-- Thanh toán (payment) — NỀN TẢNG. OR-11: mỗi payment gắn ĐÚNG 1 trong session/reservation/pass
-- (ràng buộc enforce ở hook beforeValidate của model). Khóa ngoại tới parking_session /
-- reservation / monthly_pass sẽ thêm khi các module đó được đưa lên.
CREATE TABLE IF NOT EXISTS `payment` (
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
  KEY `idx_payment_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- Hai loại xe mặc định (tùy chọn — Manager có thể thêm/sửa qua API)
INSERT IGNORE INTO `vehicle_type` (`type_name`, `type_code`, `created_at`, `updated_at`) VALUES
  ('Ô tô', 'CAR', NOW(), NOW()),
  ('Xe máy', 'MOTORBIKE', NOW(), NOW());
