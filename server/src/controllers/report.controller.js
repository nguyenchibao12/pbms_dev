import * as reportService from '../services/report.service.js';
import { asyncHandler, successResponse } from '../utils/helpers.js';

export const occupancy = asyncHandler(async (req, res) => {
  const data = await reportService.getOccupancy(req.query.floorId);
  successResponse(res, data);
});

export const overview = asyncHandler(async (req, res) => {
  const report = await reportService.getOverviewReport({
    from: req.query.from,
    to: req.query.to,
    floorId: req.query.floorId,
  });
  successResponse(res, report);
});
