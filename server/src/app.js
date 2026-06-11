import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthRoutes from './routes/health.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { securityHeaders, jsonParserLimit, getCorsOrigin } from './middleware/security.js';

dotenv.config();

const app = express();

const corsOrigin = process.env.NODE_ENV === 'production' ? getCorsOrigin() : true;

app.use(securityHeaders);
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: jsonParserLimit }));

app.get('/', (_req, res) => {
  res.json({ success: true, data: { name: 'PBMS API', version: '1.0.0' }, message: 'Welcome' });
});

app.use('/api/health', healthRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
