import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { openapiSpec } from './config/swagger.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import vehicleTypeRoutes from './routes/vehicleType.routes.js';
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
app.use('/api/auth', authRoutes);
app.use('/api/vehicle-types', vehicleTypeRoutes);

// Swagger UI — tài liệu + test API trực tiếp tại /api/docs (spec JSON: /api/docs.json)
app.get('/api/docs.json', (_req, res) => res.json(openapiSpec));
app.use(
  '/api/docs',
  (_req, res, next) => {
    res.removeHeader('Content-Security-Policy'); // cho Swagger UI nạp asset
    next();
  },
  swaggerUi.serve,
  swaggerUi.setup(openapiSpec, { customSiteTitle: 'PBMS API Docs' }),
);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
