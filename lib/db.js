import pg from "pg";
import { SCHEMA_SQL } from "./schema.js";

// Neon's Vercel integration sets DATABASE_URL (and POSTGRES_URL). Use the pooled
// connection string (its host contains "-pooler") so many function instances can share it.
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

export const isConfigured = () => Boolean(connectionString);

// One small pool per function instance, reused between requests while the instance is warm.
let pool;
function getPool() {
  if (!pool) {
    const local = /localhost|127\.0\.0\.1|host=\//.test(connectionString);
    pool = new pg.Pool({
      connectionString,
      ssl: local ? false : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000, // Neon may take a few seconds to wake after idling
    });
    pool.on("error", (err) => console.error("Postgres pool error:", err.message));
  }
  return pool;
}

// Create the tables the first time this instance touches the database.
let ready;
function ensureSchema() {
  if (!ready) {
    ready = getPool().query(SCHEMA_SQL).catch((err) => {
      ready = undefined; // try again on the next request
      throw err;
    });
  }
  return ready;
}

export async function query(text, params) {
  if (!isConfigured()) throw new Error("DATABASE_URL is not set");
  await ensureSchema();
  return getPool().query(text, params);
}
