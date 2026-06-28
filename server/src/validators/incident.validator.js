import { body, param, query } from 'express-validator';
import { INCIDENT_STATUSES, INCIDENT_TYPES, FEEDBACK_CATEGORIES } from '../models/incident.model.js';
import { STAFF_CREATABLE_INCIDENT_TYPES } from '../utils/enumLabels.js';

export const incidentListValidator = [
  query('status').optional().isIn(INCIDENT_STATUSES),
  query('type').optional().isIn(INCIDENT_TYPES),
  query('category').optional().isIn(FEEDBACK_CATEGORIES),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 200 }),
];

export const incidentCreateValidator = [
  body('type').isIn(STAFF_CREATABLE_INCIDENT_TYPES).withMessage('Invalid incident type'),
  body('description').isString().trim().notEmpty().isLength({ max: 1000 }),
  body('sessionId').optional().isInt({ min: 1 }),
  body('slotId').optional().isInt({ min: 1 }),
  body('reservationId').optional().isInt({ min: 1 }),
  body('passId').optional().isInt({ min: 1 }),
  body('userId').optional().isInt({ min: 1 }),
];

export const incidentStatusValidator = [
  param('id').isInt({ min: 1 }),
  body('status').isIn(INCIDENT_STATUSES).withMessage('Invalid status'),
];
