
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
  host: process.env.PGHOST || "localhost",
  port: 5432,
  database: process.env.PGDATABASE || "barefootNomad",
  user: "postgres",
  password: "Ankur@188",
  // Only enable SSL when explicitly requested (e.g. connecting to managed RDS)
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
});

// Do not automatically connect on import to avoid forcing a network call during tests
// Consumers can call `pool.connect()` or `testConnection()` when they want to verify connectivity.
export async function testConnection() {
  try {
    await pool.connect();
    console.log(`✅ Connected to Postgres (${process.env.PGHOST || 'localhost'})`);
  } catch (err) {
    console.error("❌ Connection error", err);
    throw err;
  }
}

export default pool;