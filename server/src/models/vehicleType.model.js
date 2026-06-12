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
  },
  { tableName: 'vehicle_type', timestamps: true }
);

export default VehicleType;
