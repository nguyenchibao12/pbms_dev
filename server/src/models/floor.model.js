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
  },
  { tableName: 'floor', timestamps: true }
);

export default Floor;
