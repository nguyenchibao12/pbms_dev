import * as publicService from '../services/public.service.js';
import { asyncHandler, successResponse } from '../utils/helpers.js';

export const pricing = asyncHandler(async (_req, res) => {
  const data = await publicService.getPublicPricing();
  successResponse(res, data);
});

export const availability = asyncHandler(async (_req, res) => {
  const data = await publicService.getPublicAvailability();
  successResponse(res, data);
});

export const info = asyncHandler(async (_req, res) => {
  const data = await publicService.getPublicInfo();
  successResponse(res, data);
});
