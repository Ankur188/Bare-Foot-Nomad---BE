
import pkg from "pg";
import dotenv from "dotenv";
const { Pool } = pkg;

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

const dbHost = process.env.PGHOST || process.env.DB_HOST || 'localhost';
const dbPort = Number(process.env.PGPORT || process.env.DB_PORT || 5432);
const dbName = process.env.PGDATABASE || process.env.DB_NAME || 'postgres';
const dbUser = process.env.PGUSER || process.env.DB_USER || 'postgres';
const dbPassword = process.env.PGPASSWORD || process.env.DB_PASS || '';

const shouldUseSsl =
  (process.env.PGSSL || '').toLowerCase() === 'true' ||
  (process.env.DB_SSL || '').toLowerCase() === 'true' ||
  isProduction;

const sslConfig = shouldUseSsl
  ? {
      require: true,
      rejectUnauthorized: false,
    }
  : false;

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig,
    })
  : new Pool({
      host: dbHost,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      port: dbPort,
      ssl: sslConfig,
    });

pool.connect()
  .then(() =>
    console.log(`✅ Connected to PostgreSQL (${dbHost}:${dbPort})`)
  )
  .catch(err => console.error("❌ Connection error", err));

export default pool;