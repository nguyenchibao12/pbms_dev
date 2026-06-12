import * as floorService from '../services/floor.service.js';
import { asyncHandler, successResponse } from '../utils/helpers.js';

export const list = asyncHandler(async (_req, res) => {
  const floors = await floorService.listFloors();
  successResponse(res, floors);
});

export const get = asyncHandler(async (req, res) => {
  const floor = await floorService.getFloor(req.params.id);
  successResponse(res, floor);
});

export const create = asyncHandler(async (req, res) => {
  const floor = await floorService.createFloor(req.body);
  successResponse(res, floor, 'Floor created', 201);
});

export const update = asyncHandler(async (req, res) => {
  const floor = await floorService.updateFloor(req.params.id, req.body);
  successResponse(res, floor, 'Floor updated');
});

export const remove = asyncHandler(async (req, res) => {
  await floorService.deleteFloor(req.params.id);
  successResponse(res, null, 'Floor deleted');
});

export const quickSetup = asyncHandler(async (req, res) => {
  const result = await floorService.quickSetupFloor(req.body);
  successResponse(res, result, 'Floor setup completed', 201);
});

export const clone = asyncHandler(async (req, res) => {
  const floor = await floorService.cloneFloor(req.params.id, req.body);
  successResponse(res, floor, 'Floor cloned', 201);
});
