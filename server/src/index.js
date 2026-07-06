import dotenv from 'dotenv';
import app from './app.js';
import sequelize, { syncSchema } from './config/db.js';
import { ensureRoles } from './utils/ensureRoles.js';
import { startReservationMaintenanceJob } from './jobs/reservationMaintenance.job.js';
import { startPassMaintenanceJob } from './jobs/passMaintenance.job.js';
import './models/index.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

const formatStartupError = (err) => {
  const code = err.original?.code || err.parent?.code;
  if (code === 'ECONNREFUSED') {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 3306;
    return `Cannot connect to MySQL at ${host}:${port}. Start MySQL and create database "${process.env.DB_NAME || 'pbms'}", then run: npm run create-admin --prefix server`;
  }
  if (code === 'ER_BAD_DB_ERROR') {
    return `Database "${process.env.DB_NAME}" does not exist. Create it in MySQL, then run: npm run create-admin --prefix server`;
  }
  if (code === 'ER_ACCESS_DENIED_ERROR') {
    return `MySQL access denied for user "${process.env.DB_USER}". Check DB_USER and DB_PASSWORD in server/.env`;
  }
  return err.message || String(err);
};

const start = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    await syncSchema();
    console.log('Database synced');

    await ensureRoles();

    startReservationMaintenanceJob();
    console.log('Reservation maintenance job started (pending TTL + no-show)');

    startPassMaintenanceJob();
    console.log('Pass maintenance job started (pending TTL + expire ended)');

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', formatStartupError(err));
    process.exit(1);
  }
};

start();
