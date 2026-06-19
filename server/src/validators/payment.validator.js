import { param } from 'express-validator';
import { checkoutValidator } from './session.validator.js';

export const paymentIdParam = [param('id').isInt({ min: 1 }).withMessage('Invalid payment id')];

export { checkoutValidator as initiateCheckoutValidator };
