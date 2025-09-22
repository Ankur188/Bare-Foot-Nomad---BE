
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  host: "barefootnomads-db.cla2coy82741.ap-south-1.rds.amazonaws.com",
  port: 5432,
  database: "barefootnomads",
  user: "barefootNomads",
  password: "BarefootNomads188",
  ssl: {
    rejectUnauthorized: false, // required for AWS RDS
  },
});


pool.connect()
  .then(() => console.log("✅ Connected to AWS RDS PostgreSQL"))
  .catch(err => console.error("❌ Connection error", err));

  export default pool;