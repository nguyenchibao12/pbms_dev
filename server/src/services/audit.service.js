import { Op } from 'sequelize';
import { AuditLog } from '../models/index.js';
import { parsePagination, findAndPaginate } from '../utils/pagination.js';

export const listAuditLogs = async ({ limit, page, actorId, action, from, to } = {}) => {
  const where = {};
  if (actorId) where.actor_id = actorId;
  if (action) where.action = action;
  if (from && to) {
    where.created_at = {
      [Op.between]: [new Date(from), new Date(`${String(to).slice(0, 10)}T23:59:59.999Z`)],
    };
  }

  const pagination = parsePagination({ page, limit });
  return findAndPaginate(AuditLog, {
    where,
    include: [
      {
        association: 'actor',
        attributes: ['user_id', 'username', 'full_name'],
      },
    ],
    order: [['created_at', 'DESC']],
    ...pagination,
  });
};
