import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

export const PAYMENT_STATUSES = ['pending', 'success', 'failed', 'refunded'];

const Payment = sequelize.define(
  'payment',
  {
    payment_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    session_id: {
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
    order_code: {
      type: DataTypes.BIGINT,
      allowNull: false,
      unique: true,
    },
    gateway_transaction_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    gateway_response: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...PAYMENT_STATUSES),
      allowNull: false,
      defaultValue: 'pending',
    },
    method: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'payos',
    },
    paid_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'payment',
    timestamps: true,
    hooks: {
      beforeValidate(payment) {
        const refValue = (field) => {
          const current = payment.getDataValue(field);
          if (current != null && current !== '') return current;
          if (!payment.isNewRecord) return payment.previous(field);
          return null;
        };
        const refs = [
          refValue('session_id'),
          refValue('reservation_id'),
          refValue('pass_id'),
        ].filter((v) => v != null && v !== '');
        if (refs.length !== 1) {
          throw new Error('Payment must reference exactly one of session, reservation, or pass');
        }
      },
    },
  }
);

export default Payment;
