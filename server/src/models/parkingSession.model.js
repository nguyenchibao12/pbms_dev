import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

export const SESSION_STATUSES = ['active', 'completed', 'exception'];
export const SESSION_TYPES = ['walk_in', 'reservation', 'monthly_pass', 'auto_registered'];

const ParkingSession = sequelize.define(
  'parking_session',
  {
    session_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
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
    gate_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Cổng VÀO (entry gate)',
    },
    exit_gate_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Cổng RA (exit gate) — ghi lúc check-out',
    },
    slot_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    vehicle_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    plate_number: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    time_in: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    gate_stage: {
      type: DataTypes.ENUM('checked_in', 'in_building', 'on_floor', 'left_floor'),
      allowNull: false,
      defaultValue: 'checked_in',
      comment:
        'Tiến trình qua cổng (máy trạng thái): checked_in → in_building → on_floor → left_floor. ' +
        'Một field lo CẢ: ép đúng thứ tự cổng (không ra tầng khi chưa vào) + chặn vào lại.',
    },
    time_out: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    left_floor_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment:
        'Mốc xe RỜI TẦNG (quét cổng tầng OUT). Dùng làm mốc CHỐT phí — phí tính ' +
        'từ time_in tới mốc này, không tính thời gian đi từ tầng ra cổng tòa.',
    },
    qr_token: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    check_in_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    check_out_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    session_type: {
      type: DataTypes.ENUM(...SESSION_TYPES),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...SESSION_STATUSES),
      allowNull: false,
      defaultValue: 'active',
    },
    calculated_fee: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
  },
  { tableName: 'parking_session', timestamps: true,
    indexes: [
      { fields: ['plate_number', 'status'], name: 'idx_session_plate_status' },
      { fields: ['status'], name: 'idx_session_status' },
    ],
  }
);

export default ParkingSession;
