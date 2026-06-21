import { param } from 'express-validator';

export const passIdParam = [param('id').isInt({ min: 1 }).withMessage('Invalid pass id')];
