import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Zone = sequelize.define(
  'zone',
  {
    zone_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    floor_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    vehicle_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    zone_code: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    label: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    total_slots: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    monthly_pass_capacity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'OR-03: số slot tối đa dành cho vé tháng (0 = không mở bán vé tháng ở khu này)',
    },
  },
  {
    tableName: 'zone',
    timestamps: true,
    indexes: [{ unique: true, fields: ['floor_id', 'zone_code'] }],
  }
);

export default Zone;
