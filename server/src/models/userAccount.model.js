import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const UserAccount = sequelize.define(
  'user_account',
  {
    user_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    full_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    auth_provider: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'local',
      comment: 'local | google',
    },
    google_id: {
      type: DataTypes.STRING(64),
      allowNull: true,
      unique: true,
    },
    reset_token_hash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'SHA-256 của token reset mật khẩu',
    },
    reset_token_expires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    email_verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    verification_token_hash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'SHA-256 của token xác minh email',
    },
    verification_token_expires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'user_account',
    timestamps: true,
    defaultScope: {
      attributes: { exclude: ['password_hash', 'reset_token_hash', 'verification_token_hash'] },
    },
    scopes: {
      withPassword: {
        attributes: { include: ['password_hash'] },
      },
    },
  }
);

export default UserAccount;
