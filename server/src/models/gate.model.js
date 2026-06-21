import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Gate = sequelize.define(
  'gate',
  {
    gate_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    floor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'NULL = cổng cấp tòa nhà (không thuộc tầng nào)',
    },
    gate_code: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    direction: {
      type: DataTypes.ENUM('in', 'out'),
      allowNull: false,
    },
    vehicle_type_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'NULL = mọi loại xe; nên gán riêng ô tô / xe máy',
    },
    label: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'gate',
    timestamps: true,
    indexes: [{ unique: true, fields: ['floor_id', 'gate_code'] }],
  }
);

export default Gate;
