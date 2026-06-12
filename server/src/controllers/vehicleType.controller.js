import * as vehicleTypeService from '../services/vehicleType.service.js';
import { asyncHandler, successResponse } from '../utils/helpers.js';

export const list = asyncHandler(async (_req, res) => {
  const types = await vehicleTypeService.listVehicleTypes();
  successResponse(res, types);
});

export const get = asyncHandler(async (req, res) => {
  const type = await vehicleTypeService.getVehicleType(req.params.id);
  successResponse(res, type);
});

export const create = asyncHandler(async (req, res) => {
  const type = await vehicleTypeService.createVehicleType(req.body);
  successResponse(res, type, 'Vehicle type created', 201);
});

export const update = asyncHandler(async (req, res) => {
  const type = await vehicleTypeService.updateVehicleType(req.params.id, req.body);
  successResponse(res, type, 'Vehicle type updated');
});

export const remove = asyncHandler(async (req, res) => {
  await vehicleTypeService.deleteVehicleType(req.params.id);
  successResponse(res, null, 'Vehicle type deleted');
});
