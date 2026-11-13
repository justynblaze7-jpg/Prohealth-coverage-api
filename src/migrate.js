// Run the schema by hand: npm run migrate
// (The server also runs it automatically on every start.)
import { migrate, pool } from "./db.js";

try {
  await migrate();
  console.log("Schema is up to date.");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
