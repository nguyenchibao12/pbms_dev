import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const PricingRule = sequelize.define(
  'pricing_rule',
  {
    pricing_rule_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    vehicle_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    unit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Billing unit in minutes',
    },
    base_rate: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    effective_from: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    effective_to: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  { tableName: 'pricing_rule', timestamps: true }
);

export default PricingRule;
