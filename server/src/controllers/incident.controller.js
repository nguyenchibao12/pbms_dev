import * as incidentService from '../services/incident.service.js';
import { asyncHandler, successResponse } from '../utils/helpers.js';
import { ROLES } from '../middleware/rbac.js';

export const list = asyncHandler(async (req, res) => {
  const roleName = req.user.role?.role_name;
  const incidents = await incidentService.listIncidents({
    status: req.query.status,
    type: req.query.type,
    category: req.query.category,
    limit: req.query.limit,
    page: req.query.page,
    roleName,
    // Staff chỉ thấy sự cố do chính mình báo; Manager/Admin thấy tất cả
    reporterId: roleName === ROLES.STAFF ? req.user.user_id : null,
  });
  successResponse(res, incidents);
});

export const create = asyncHandler(async (req, res) => {
  const incident = await incidentService.createIncident(req.user.user_id, req.body);
  successResponse(res, incident, 'Incident recorded', 201);
});

export const updateStatus = asyncHandler(async (req, res) => {
  const incident = await incidentService.updateIncidentStatus(req.params.id, req.body.status, req.user.user_id);
  successResponse(res, incident, 'Incident status updated');
});
