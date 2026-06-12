import * as gateService from '../services/gate.service.js';
import { asyncHandler, successResponse } from '../utils/helpers.js';

export const list = asyncHandler(async (req, res) => {
  const gates = await gateService.listGates(req.query.floorId);
  successResponse(res, gates);
});

export const get = asyncHandler(async (req, res) => {
  const gate = await gateService.getGate(req.params.id);
  successResponse(res, gate);
});

export const create = asyncHandler(async (req, res) => {
  const gate = await gateService.createGate(req.body);
  successResponse(res, gate, 'Gate created', 201);
});

export const update = asyncHandler(async (req, res) => {
  const gate = await gateService.updateGate(req.params.id, req.body);
  successResponse(res, gate, 'Gate updated');
});

export const remove = asyncHandler(async (req, res) => {
  await gateService.deleteGate(req.params.id);
  successResponse(res, null, 'Gate deleted');
});
