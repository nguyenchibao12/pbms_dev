import { Router } from 'express';

const router = Router();

router.get('/',
  /* #swagger.tags = ['System']
     #swagger.summary = 'Health check'
     #swagger.security = [] */
  (_req, res) => {
    res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } });
  });

export default router;
