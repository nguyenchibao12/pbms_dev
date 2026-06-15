import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Setting = sequelize.define(
  'setting',
  {
    setting_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      defaultValue: 1,
    },
    building_config: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JSON: building_name, address, phone, is_24_7, open_time, close_time',
    },
    system_config: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JSON: booking_fee, monthly_pass_price, lost_ticket_fee, slot_suggest_strategy, ai_logging_enabled',
    },
  },
  {
    tableName: 'setting',
    timestamps: true,
  },
);

export default Setting;
