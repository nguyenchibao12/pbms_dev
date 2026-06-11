import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthRoutes from './routes/health.routes.js';

dotenv.config();

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ success: true, data: { name: 'PBMS API', version: '1.0.0' }, message: 'Welcome' });
});

app.use('/api/health', healthRoutes);

export default app;
