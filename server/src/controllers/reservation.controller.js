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
