import { Op } from 'sequelize';
import { MonthlyPass } from '../models/index.js';
import { AppError } from '../utils/helpers.js';
import { getPassCapacity } from '../utils/passCapacity.js';

const passIncludes = [
  { association: 'floor' },
  { association: 'vehicleType' },
  { association: 'user', attributes: ['user_id', 'full_name', 'username'] },
  { association: 'payments' },
];

export { getPassCapacity } from '../utils/passCapacity.js';

export const getPass = async (id) => {
  const pass = await MonthlyPass.findByPk(id, { include: passIncludes });
  if (!pass) throw new AppError('Monthly pass not found', 404, 'NOT_FOUND');
  return pass;
};

export const listUserPasses = async (userId) =>
  MonthlyPass.findAll({
    where: { user_id: userId },
    include: passIncludes,
    order: [['created_at', 'DESC']],
  });

export const countPassCapacityUsage = async (floorId, vehicleTypeId) => {
  const today = new Date().toISOString().slice(0, 10);
  return MonthlyPass.count({
    where: {
      floor_id: floorId,
      vehicle_type_id: vehicleTypeId,
      status: { [Op.in]: ['pending', 'active'] },
      start_date: { [Op.lte]: today },
      end_date: { [Op.gte]: today },
    },
  });
};
