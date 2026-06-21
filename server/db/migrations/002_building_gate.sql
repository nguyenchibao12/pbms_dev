-- Migration 002: cổng cấp tòa nhà
--   mysql -u root -p <db> < server/db/migrations/002_building_gate.sql
-- Cho phép gate.floor_id = NULL để biểu diễn cổng cấp tòa nhà (không thuộc tầng nào).

ALTER TABLE `gate`
  MODIFY COLUMN `floor_id` INT NULL COMMENT 'NULL = cổng cấp tòa nhà (không thuộc tầng nào)';
