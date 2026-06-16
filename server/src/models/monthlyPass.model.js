import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

export const PASS_STATUSES = ['pending', 'active', 'expired', 'cancelled'];

const MonthlyPass = sequelize.define(
  'monthly_pass',
  {
    pass_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    vehicle_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    floor_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    plate_number: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    valid_from_time: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    valid_to_time: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...PASS_STATUSES),
      allowNull: false,
      defaultValue: 'pending',
    },
    qr_token: {
      type: DataTypes.STRING(64),
      allowNull: true,
      unique: true,
    },
  },
  { tableName: 'monthly_pass', timestamps: true }
);

export default MonthlyPass;
