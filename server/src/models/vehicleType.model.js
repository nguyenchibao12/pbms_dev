import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const VehicleType = sequelize.define(
  'vehicle_type',
  {
    vehicle_type_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    type_name: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    type_code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
    slot_area_m2: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: false,
      defaultValue: 0,
      comment:
        'Diện tích hiệu dụng 1 slot của loại xe (m², đã gộp lối đi). 0 = chưa cấu hình. ' +
        'Dùng để tính sức chứa tầng theo diện tích.',
    },
  },
  { tableName: 'vehicle_type', timestamps: true }
);

export default VehicleType;
