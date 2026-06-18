import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

export const INCIDENT_TYPES = [
  'wrong_floor',
  'duplicate_session',
  'window_violation',
  'slot_conflict',
  'lost_ticket',
  'wrong_info',
  'overstay',
  'wrong_zone',
  'feedback',
  'other',
];

export const INCIDENT_STATUSES = ['open', 'investigating', 'resolved'];

export const FEEDBACK_CATEGORIES = [
  'lost_card',
  'wrong_fee',
  'hard_to_find',
  'slot_taken',
  'other',
];

const Incident = sequelize.define(
  'incident',
  {
    incident_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    session_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    slot_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    reservation_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    pass_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    reported_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Staff/Admin who reported the incident',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM(...INCIDENT_TYPES),
      allowNull: false,
      defaultValue: 'other',
    },
    category: {
      type: DataTypes.ENUM(...FEEDBACK_CATEGORIES),
      allowNull: true,
      comment: 'Feedback category when type=feedback',
    },
    status: {
      type: DataTypes.ENUM(...INCIDENT_STATUSES),
      allowNull: false,
      defaultValue: 'open',
    },
  },
  { tableName: 'incident', timestamps: true }
);

export default Incident;
