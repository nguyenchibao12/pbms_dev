import { query } from 'express-validator';

export const reportRangeValidator = [
  query('from').isISO8601().withMessage('from date required'),
  query('to').isISO8601().withMessage('to date required'),
  query('floorId').optional().isInt({ min: 1 }),
];

export const occupancyValidator = [query('floorId').optional().isInt({ min: 1 })];
