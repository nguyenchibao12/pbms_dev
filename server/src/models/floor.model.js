import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Floor = sequelize.define(
  'floor',
  {
    floor_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    floor_code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
    floor_level: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    label: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    layout_mode: {
      type: DataTypes.ENUM('single', 'zoned'),
      allowNull: false,
      defaultValue: 'zoned',
      comment:
        "single = cả tầng 1 loại xe (Lv1, khóa tạo khu, tự tạo 1 khu mặc định); " +
        "zoned = phân khu theo loại xe (Lv2, cho tạo nhiều khu).",
    },
    vehicle_type_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Chỉ dùng khi layout_mode = single: loại xe dành riêng cho cả tầng.',
    },
    area_m2: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment:
        'Diện tích sàn đỗ của tầng (m²). NULL = không giới hạn diện tích (legacy). ' +
        'Bắt buộc khi layout_mode = single để suy ra sức chứa.',
    },
  },
  { tableName: 'floor', timestamps: true }
);

export default Floor;
