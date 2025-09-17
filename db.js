import pg from "pg";
const { Pool } = pg;

let localPoolConfig = {
  user: "postgres",
  password: "Ankur@188",
  host: "localhost",
  port: 5432,
  database: "barefootNomad",
};

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorised: false },
    }
  : localPoolConfig;

  const pool = new Pool(poolConfig);
  
  export default pool;
