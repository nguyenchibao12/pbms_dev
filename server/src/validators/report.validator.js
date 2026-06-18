import { query } from 'express-validator';

export const occupancyValidator = [query('floorId').optional().isInt({ min: 1 })];
