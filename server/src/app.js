import { readFileSync } from 'node:fs';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import vehicleTypeRoutes from './routes/vehicleType.routes.js';
import floorRoutes from './routes/floor.routes.js';
import zoneRoutes from './routes/zone.routes.js';
import parkingSlotRoutes from './routes/parkingSlot.routes.js';
import gateRoutes from './routes/gate.routes.js';
import pricingRuleRoutes from './routes/pricingRule.routes.js';
import userAdminRoutes from './routes/userAdmin.routes.js';
import auditRoutes from './routes/audit.routes.js';
import publicRoutes from './routes/public.routes.js';
import sessionRoutes from './routes/session.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { securityHeaders, jsonParserLimit, getCorsOrigin } from './middleware/security.js';

dotenv.config();

// OpenAPI spec tự sinh từ route (swagger-autogen). Sinh lại bằng: npm run swagger
const openapiSpec = JSON.parse(
  readFileSync(new URL('./config/swagger-output.json', import.meta.url)),
);

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
  // #swagger.ignore = true
  res.json({ success: true, data: { name: 'PBMS API', version: '1.0.0' }, message: 'Welcome' });
});

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/vehicle-types', vehicleTypeRoutes);
app.use('/api/floors', floorRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/parking-slots', parkingSlotRoutes);
app.use('/api/gates', gateRoutes);
app.use('/api/pricing-rules', pricingRuleRoutes);
app.use('/api/admin/users', userAdminRoutes);
app.use('/api/admin/audit-logs', auditRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/sessions', sessionRoutes);

// Swagger UI — tài liệu + test API trực tiếp tại /api/docs (spec JSON: /api/docs.json)
app.get('/api/docs.json', (_req, res) => {
  // #swagger.ignore = true
  res.json(openapiSpec);
});
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
