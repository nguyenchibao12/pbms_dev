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

SET FOREIGN_KEY_CHECKS = 1;
