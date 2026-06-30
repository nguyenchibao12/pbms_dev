import * as parkingSlotService from '../services/parkingSlot.service.js';
import { asyncHandler, successResponse } from '../utils/helpers.js';

export const list = asyncHandler(async (req, res) => {
  const slots = await parkingSlotService.listParkingSlots(req.query.zoneId);
  successResponse(res, slots);
});

export const get = asyncHandler(async (req, res) => {
  const slot = await parkingSlotService.getParkingSlot(req.params.id);
  successResponse(res, slot);
});

export const nextCode = asyncHandler(async (req, res) => {
  const result = await parkingSlotService.previewNextSlotCode(req.query.zoneId);
  successResponse(res, result);
});

export const create = asyncHandler(async (req, res) => {
  const slot = await parkingSlotService.createParkingSlot(req.body);
  successResponse(res, slot, 'Parking slot created', 201);
});

export const update = asyncHandler(async (req, res) => {
  const slot = await parkingSlotService.updateParkingSlot(req.params.id, req.body);
  successResponse(res, slot, 'Parking slot updated');
});

export const updateStatus = asyncHandler(async (req, res) => {
  const slot = await parkingSlotService.updateSlotStatus(req.params.id, req.body.status);
  successResponse(res, slot, 'Slot status updated');
});

export const remove = asyncHandler(async (req, res) => {
  await parkingSlotService.deleteParkingSlot(req.params.id);
  successResponse(res, null, 'Parking slot deleted');
});
