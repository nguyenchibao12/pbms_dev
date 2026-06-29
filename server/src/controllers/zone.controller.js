import * as zoneService from '../services/zone.service.js';
import * as parkingSlotService from '../services/parkingSlot.service.js';
import { asyncHandler, successResponse } from '../utils/helpers.js';

export const list = asyncHandler(async (req, res) => {
  const zones = await zoneService.listZones(req.query.floorId);
  successResponse(res, zones);
});

export const get = asyncHandler(async (req, res) => {
  const zone = await zoneService.getZone(req.params.id);
  successResponse(res, zone);
});

export const nextCode = asyncHandler(async (req, res) => {
  const result = await zoneService.previewNextZoneCode(req.query.floorId, req.query.vehicleTypeId);
  successResponse(res, result);
});

export const create = asyncHandler(async (req, res) => {
  const zone = await zoneService.createZone(req.body);
  successResponse(res, zone, 'Zone created', 201);
});

export const update = asyncHandler(async (req, res) => {
  const zone = await zoneService.updateZone(req.params.id, req.body);
  successResponse(res, zone, 'Zone updated');
});

export const remove = asyncHandler(async (req, res) => {
  await zoneService.deleteZone(req.params.id);
  successResponse(res, null, 'Zone deleted');
});

export const bulkGenerateSlots = asyncHandler(async (req, res) => {
  const result = await parkingSlotService.bulkGenerateSlots(req.params.id, req.body);
  successResponse(res, result, `Created ${result.created} slots (${result.skipped} skipped)`);
});
