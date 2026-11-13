import pg from "pg";
import { readFile } from "node:fs/promises";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Add it in Render under Environment.");
  process.exit(1);
}

// Render's internal database URL needs no SSL; its external URL does.
// DATABASE_SSL=true forces SSL (use it when connecting from outside Render).
const useSsl =
  process.env.DATABASE_SSL === "true" ||
  /render\.com|sslmode=require/.test(connectionString);

export const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: Number(process.env.DB_POOL_MAX || 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => console.error("Postgres pool error:", err.message));

export async function migrate() {
  const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  await pool.query(sql);
}

export const query = (text, params) => pool.query(text, params);
