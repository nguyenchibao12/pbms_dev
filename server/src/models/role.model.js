import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Role = sequelize.define(
  'role',
  {
    role_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    role_name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
  },
  {
    tableName: 'role',
    timestamps: true,
  }
);

export default Role;
