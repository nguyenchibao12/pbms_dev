import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const AuditLog = sequelize.define(
  'audit_log',
  {
    log_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    actor_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    details: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JSON payload',
    },
  },
  {
    tableName: 'audit_log',
    timestamps: true,
    updatedAt: false,
  },
);

export default AuditLog;
