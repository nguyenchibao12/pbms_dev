import { Router } from 'express';
import * as publicController from '../controllers/public.controller.js';

const router = Router();

router.get('/pricing', publicController.pricing);
router.get('/availability', publicController.availability);
router.get('/info', publicController.info);

export default router;
