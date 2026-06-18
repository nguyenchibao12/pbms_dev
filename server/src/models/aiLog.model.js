import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const AiLog = sequelize.define(
  'ai_log',
  {
    log_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    session_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    algorithm_used: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    candidates_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    selected_slot_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    executed_time_ms: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    floor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    vehicle_type_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    context: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
  },
  {
    tableName: 'ai_log',
    timestamps: true,
    createdAt: 'create_at',
    updatedAt: false,
  }
);

export default AiLog;
