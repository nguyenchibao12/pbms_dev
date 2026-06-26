import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';

dotenv.config();

const defineOptions = {
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    timezone: '+07:00',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    define: defineOptions,
  },
);

/**
 * MySQL: alter:true on every dev restart duplicates UNIQUE indexes until MySQL hits
 * the 64-key limit ("Too many keys specified"). Use sync() only; set DB_SYNC_ALTER=true
 * for a single alter pass, or { fresh: true } to drop & recreate when schema changes.
 */
export const syncSchema = async ({ fresh = false } = {}) => {
  if (fresh) {
    await sequelize.sync({ force: true });
    return;
  }
  const useAlter = process.env.DB_SYNC_ALTER === 'true';
  await sequelize.sync({ alter: useAlter });
};

export default sequelize;
