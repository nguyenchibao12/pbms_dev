import * as gateService from '../services/gate.service.js';
import { scanGate, getExitStatus } from '../services/gateScan.service.js';
import { asyncHandler, successResponse } from '../utils/helpers.js';

// Kiosk cổng: quét QR → mở/đóng cổng (không cần đăng nhập staff).
export const scan = asyncHandler(async (req, res) => {
  const result = await scanGate({ qrToken: req.body.qrToken, gateId: req.body.gateId });
  successResponse(res, result, 'Gate scan processed');
});

// Kiosk cổng OUT: poll trạng thái ra của phiên → đã 'completed' thì kiosk tự mở barie.
export const exitStatus = asyncHandler(async (req, res) => {
  const result = await getExitStatus(req.query.sessionId);
  successResponse(res, result);
});

// Kiosk cổng: danh sách cổng cho dropdown (header X-Kiosk-Key, không cần đăng nhập).
export const kioskList = asyncHandler(async (_req, res) => {
  const gates = await gateService.listGatesForKiosk();
  const data = gates.map((g) => {
    const plain = g.get({ plain: true });
    return {
      gate_id: plain.gate_id,
      gate_code: plain.gate_code,
      label: plain.label,
      direction: plain.direction,
      floor_id: plain.floor_id,
      floor_code: plain.floor?.floor_code ?? null,
    };
  });
  successResponse(res, data);
});

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
