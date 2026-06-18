import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

export const RESERVATION_STATUSES = [
  'pending',
  'confirmed',
  'checked_in',
  'completed',
  'cancelled',
  'no_show',
];

const Reservation = sequelize.define(
  'reservation',
  {
    reservation_id: {
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
    zone_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    slot_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    plate_number: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    end_time: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...RESERVATION_STATUSES),
      allowNull: false,
      defaultValue: 'pending',
    },
    reservation_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'standard',
    },
    qr_token: {
      type: DataTypes.STRING(64),
      allowNull: true,
      unique: true,
    },
  },
  { tableName: 'reservation', timestamps: true }
);

export default Reservation;
