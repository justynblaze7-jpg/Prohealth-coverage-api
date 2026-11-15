// POST /api/checks  ->  stores one anonymous coverage check, returns {"stored":true,"id":123}
import { query, isConfigured } from "../../lib/db.js";
import { parseCheck } from "../../lib/validate.js";
import { allow, body, rateLimited } from "../../lib/http.js";

export default async function handler(req, res) {
  if (!allow(req, res, "POST")) return;
  if (rateLimited(req, res)) return;
  if (!isConfigured()) return res.status(202).json({ stored: false, reason: "database not configured" });

  const b = body(req);
  if (b.tooLarge) return res.status(413).json({ error: "Body too large" });
  if (b.bad) return res.status(400).json({ error: "Body must be valid JSON" });

  const { row, error } = parseCheck(b.data, req.headers["user-agent"]);
  if (error) return res.status(400).json({ error });

  try {
    const cols = Object.keys(row);
    const { rows } = await query(
      `INSERT INTO coverage_checks (${cols.join(",")})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")})
       RETURNING id`,
      cols.map((c) => row[c])
    );
    res.status(201).json({ stored: true, id: Number(rows[0].id) });
  } catch (err) {
    console.error("Insert check failed:", err.message);
    res.status(500).json({ error: "Could not store the check" });
  }
}
