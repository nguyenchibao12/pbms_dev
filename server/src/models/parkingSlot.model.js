import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

export const SLOT_STATUSES = ['available', 'reserved', 'occupied', 'maintenance', 'locked'];

const ParkingSlot = sequelize.define(
  'parking_slot',
  {
    slot_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    zone_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    slot_code: {
      type: DataTypes.STRING(40),
      allowNull: false,
      comment: 'Mã chỗ tự sinh theo <mã khu>-NN (vd F1-CAR-01-03). Không nhập tự do.',
    },
    status: {
      type: DataTypes.ENUM(...SLOT_STATUSES),
      allowNull: false,
      defaultValue: 'available',
    },
    slot_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    distance_to_gate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    distance_to_elevator: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Khoảng cách tới thang máy/lối ra (m) — dùng cho AI scoring',
    },
  },
  {
    tableName: 'parking_slot',
    timestamps: true,
    indexes: [{ unique: true, fields: ['zone_id', 'slot_code'] }],
  }
);

export default ParkingSlot;
