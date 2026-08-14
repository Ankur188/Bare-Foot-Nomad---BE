
import pkg from "pg";
import dotenv from "dotenv";
const { Pool } = pkg;

dotenv.config();

// Use environment variables when available; fall back to sensible local defaults.
// Assumptions:
// - Local Postgres is reachable at localhost:5432 by default
// - Database name defaults to 'barefootnomads'
// - Local user defaults to 'postgres' with empty password unless provided via env

const pool = new Pool({
  host: 'barefootnomads.ct8ak62u8dub.ap-south-1.rds.amazonaws.com',
  user: 'postgres',
  password: "postgres",
  database: 'barefootnomads',
  port: 5432,
  ssl: {
    require: true,
    rejectUnauthorized: false
  }
});

pool.connect()
  .then(() => console.log("✅ Connected to AWS RDS PostgreSQL"))
  .catch(err => console.error("❌ Connection error", err));

export default pool;