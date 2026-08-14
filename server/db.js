const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("Falta la variable de entorno DATABASE_URL.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon requiere SSL
});

module.exports = { pool };
