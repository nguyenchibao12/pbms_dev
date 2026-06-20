import * as reservationService from '../services/reservation.service.js';
import { asyncHandler, successResponse, AppError } from '../utils/helpers.js';

export const create = asyncHandler(async (req, res) => {
  const result = await reservationService.createReservation(req.user.user_id, req.body);
  successResponse(res, result, 'Reservation created — pay booking fee to confirm', 201);
});

export const listMine = asyncHandler(async (req, res) => {
  const list = await reservationService.listUserReservations(req.user.user_id);
  successResponse(res, list);
});

export const get = asyncHandler(async (req, res) => {
  const reservation = await reservationService.getReservation(req.params.id);
  const isOwner = reservation.user_id === req.user.user_id;
  const isStaff = req.user.role?.role_name === 'Staff';
  if (!isOwner && !isStaff) {
    throw new AppError('Not allowed', 403, 'FORBIDDEN');
  }
  successResponse(res, reservation);
});

export const cancel = asyncHandler(async (req, res) => {
  const reservation = await reservationService.cancelUserReservation(
    req.user.user_id,
    req.params.id
  );
  successResponse(res, reservation, 'Reservation cancelled');
});

export const listStaffUpcoming = asyncHandler(async (_req, res) => {
  const list = await reservationService.listStaffUpcomingReservations();
  successResponse(res, list);
});

export const staffLookupByQr = asyncHandler(async (req, res) => {
  const reservation = await reservationService.staffLookupReservationByQr(req.query.qrToken);
  successResponse(res, reservation);
});

export const checkin = asyncHandler(async (req, res) => {
  const result = await reservationService.checkinReservation(req.user.user_id, req.body);
  successResponse(res, result, 'Reservation check-in successful', 201);
});

export const windowAvailability = asyncHandler(async (req, res) => {
  const data = await reservationService.getWindowAvailability({
    floorId: Number(req.query.floorId),
    vehicleTypeId: Number(req.query.vehicleTypeId),
    startTime: req.query.startTime,
    endTime: req.query.endTime,
    shiftId: req.query.shiftId,
    arrivalDate: req.query.arrivalDate,
    zoneId: req.query.zoneId ? Number(req.query.zoneId) : undefined,
  });
  successResponse(res, data);
});

export const suggestSlotPreview = asyncHandler(async (req, res) => {
  const data = await reservationService.previewSuggestSlot({
    floorId: Number(req.query.floorId),
    vehicleTypeId: Number(req.query.vehicleTypeId),
    startTime: req.query.startTime,
    endTime: req.query.endTime,
    shiftId: req.query.shiftId,
    arrivalDate: req.query.arrivalDate,
    zoneId: req.query.zoneId ? Number(req.query.zoneId) : undefined,
    topN: req.query.topN ? Number(req.query.topN) : undefined,
    userId: req.user?.user_id,
  });
  successResponse(res, data);
});
