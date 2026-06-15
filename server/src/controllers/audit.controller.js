import * as auditService from '../services/audit.service.js';
import { asyncHandler, successResponse } from '../utils/helpers.js';

export const list = asyncHandler(async (req, res) => {
  const logs = await auditService.listAuditLogs({
    limit: req.query.limit,
    page: req.query.page,
    actorId: req.query.actorId,
    action: req.query.action,
    from: req.query.from,
    to: req.query.to,
  });
  successResponse(res, logs);
});
