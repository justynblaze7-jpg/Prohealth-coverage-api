// GET /api/health  ->  {"ok":true,"db":"up"} when the database answers
import { query, isConfigured } from "../lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!isConfigured()) return res.status(503).json({ ok: false, db: "not configured" });
  try {
    await query("SELECT 1");
    res.status(200).json({ ok: true, db: "up" });
  } catch (err) {
    console.error("Health check failed:", err.message);
    res.status(503).json({ ok: false, db: "down" });
  }
}
