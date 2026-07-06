import * as monthlyPassService from '../services/monthlyPass.service.js';
import { asyncHandler, successResponse, AppError } from '../utils/helpers.js';

export const purchase = asyncHandler(async (req, res) => {
  const result = await monthlyPassService.purchaseMonthlyPass(req.user.user_id, {
    ...req.body,
    startDate: req.body.startDate.slice(0, 10),
  });
  successResponse(res, result, 'Monthly pass created — complete payment to activate', 201);
});

export const repay = asyncHandler(async (req, res) => {
  const result = await monthlyPassService.repayMonthlyPass(req.user.user_id, req.params.id);
  successResponse(res, result, result.reused ? 'Dùng lại link thanh toán còn hiệu lực' : 'Đã tạo link thanh toán mới');
});

export const listMine = asyncHandler(async (req, res) => {
  const list = await monthlyPassService.listUserPasses(req.user.user_id);
  successResponse(res, list);
});

export const get = asyncHandler(async (req, res) => {
  const pass = await monthlyPassService.getPass(req.params.id);
  const isOwner = pass.user_id === req.user.user_id;
  const isStaff = req.user.role?.role_name === 'Staff';
  if (!isOwner && !isStaff) {
    throw new AppError('Not allowed', 403, 'FORBIDDEN');
  }
  successResponse(res, pass);
});

export const getCapacity = asyncHandler(async (req, res) => {
  const floorId = Number(req.query.floorId);
  const vehicleTypeId = Number(req.query.vehicleTypeId);
  if (!floorId || !vehicleTypeId) {
    throw new AppError('floorId and vehicleTypeId required', 400, 'VALIDATION_ERROR');
  }
  const total = await monthlyPassService.getPassCapacity(floorId, vehicleTypeId);
  const used = await monthlyPassService.countPassCapacityUsage(floorId, vehicleTypeId);
  successResponse(res, { total, used, available: Math.max(0, total - used) });
});
