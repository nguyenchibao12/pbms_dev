import { Op } from 'sequelize';
import Incident, { INCIDENT_TYPES, FEEDBACK_CATEGORIES } from '../models/incident.model.js';
import { AppError } from '../utils/helpers.js';
import { ROLES } from '../middleware/rbac.js';
import { parsePagination, findAndPaginate, paginatedResult } from '../utils/pagination.js';
import { enrichIncident } from '../utils/enumLabels.js';

const LINK_REQUIRED_TYPES = ['lost_ticket', 'wrong_info', 'overstay', 'wrong_zone'];

const incidentIncludes = [
  { association: 'session', attributes: ['session_id', 'plate_number', 'session_type'] },
  { association: 'slot', attributes: ['slot_id', 'slot_code'] },
  { association: 'user', attributes: ['user_id', 'full_name', 'username'] },
  { association: 'reporter', attributes: ['user_id', 'full_name', 'username'] },
];

export const recordIncident = async (payload) => {
  try {
    return await Incident.create({
      session_id: payload.sessionId || null,
      slot_id: payload.slotId || null,
      user_id: payload.userId || null,
      reservation_id: payload.reservationId || null,
      pass_id: payload.passId || null,
      reported_by: payload.reportedBy || null,
      type: payload.type || 'other',
      category: payload.category || null,
      description: payload.description,
      status: payload.status || 'open',
    });
  } catch (err) {
    console.error('[incident] Failed to write incident:', err.message);
    return null;
  }
};

export const createIncident = async (reporterId, data) => {
  if (!INCIDENT_TYPES.includes(data.type)) {
    throw new AppError('Invalid incident type', 400, 'INCIDENT_INVALID');
  }

  if (LINK_REQUIRED_TYPES.includes(data.type)) {
    const hasLink =
      data.sessionId || data.slotId || data.reservationId || data.passId || data.userId;
    if (!hasLink) {
      throw new AppError(
        'At least one linked entity (session, slot, reservation, pass, user) is required',
        400,
        'INCIDENT_INVALID',
      );
    }
  }

  const incident = await Incident.create({
    session_id: data.sessionId || null,
    slot_id: data.slotId || null,
    user_id: data.userId || null,
    reservation_id: data.reservationId || null,
    pass_id: data.passId || null,
    reported_by: reporterId,
    type: data.type,
    category: data.category || null,
    description: data.description.trim(),
    status: 'open',
  });

  return enrichIncident(await incident.reload({ include: incidentIncludes }));
};

export const createUserFeedback = async (userId, data) => {
  if (!FEEDBACK_CATEGORIES.includes(data.category)) {
    throw new AppError('Invalid feedback category', 400, 'FEEDBACK_INVALID');
  }

  const incident = await Incident.create({
    session_id: data.sessionId || null,
    slot_id: null,
    user_id: userId,
    reported_by: null,
    type: 'feedback',
    category: data.category,
    description: data.description.trim(),
    status: 'open',
  });

  return enrichIncident(await incident.reload({ include: incidentIncludes }));
};

export const listIncidents = async ({
  status,
  type,
  category,
  limit,
  page,
  roleName,
  reporterId,
}) => {
  const where = {};
  if (status) where.status = status;
  if (type) where.type = type;
  if (category) where.category = category;
  if (roleName === ROLES.STAFF && reporterId) {
    where.reported_by = reporterId;
  }

  const pagination = parsePagination({ page, limit });
  const result = await findAndPaginate(Incident, {
    where,
    include: incidentIncludes,
    order: [['created_at', 'DESC']],
    ...pagination,
  });

  return paginatedResult(
    result.items.map(enrichIncident),
    result.total,
    result.page,
    result.limit,
  );
};

export const updateIncidentStatus = async (id, status) => {
  const incident = await Incident.findByPk(id);
  if (!incident) throw new AppError('Incident not found', 404, 'NOT_FOUND');
  await incident.update({ status });
  return enrichIncident(await incident.reload({ include: incidentIncludes }));
};

/**
 * Vé tháng quét cổng ngoài khung giờ hiệu lực → ghi incident window_violation để admin có
 * vết audit (kèm chặn cứng PASS_OUTSIDE_WINDOW ở monthlyPass.service). Chống spam: bỏ qua
 * nếu vé này đã có incident window_violation 'open' trong 60 phút gần nhất (khách hay quét lại).
 */
export const recordPassWindowViolation = async ({ passId, userId, plateNumber, gateId }) => {
  const recent = await Incident.findOne({
    where: {
      pass_id: passId,
      type: 'window_violation',
      status: 'open',
      created_at: { [Op.gte]: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (recent) return recent;

  return recordIncident({
    type: 'window_violation',
    passId,
    userId,
    description: `Vé tháng ${plateNumber} quét cổng ngoài khung giờ hiệu lực${gateId ? ` (gate ${gateId})` : ''}`,
    status: 'open',
  });
};

export const recordWrongFloorIncident = async ({
  gateFloorId,
  expectedFloorId,
  reservationId,
  passId,
  userId,
  slotId,
}) => {
  const entity = reservationId ? 'reservation' : 'pass';
  return recordIncident({
    type: 'wrong_floor',
    description: `Wrong floor at gate: gate on floor ${gateFloorId}, ${entity} expects floor ${expectedFloorId}`,
    reservationId,
    passId,
    userId,
    slotId,
  });
};
