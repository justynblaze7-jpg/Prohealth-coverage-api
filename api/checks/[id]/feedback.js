// POST /api/checks/:id/feedback  body {"helpful":true}  ->  {"stored":true}
// A second answer for the same check replaces the first (allowed within 24 hours of the check).
import { query, isConfigured } from "../../../lib/db.js";
import { parseFeedback } from "../../../lib/validate.js";
import { allow, body, rateLimited } from "../../../lib/http.js";

export default async function handler(req, res) {
  if (!allow(req, res, "POST")) return;
  if (rateLimited(req, res)) return;
  if (!isConfigured()) return res.status(202).json({ stored: false, reason: "database not configured" });

  const id = Number(req.query.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid check id" });

  const b = body(req);
  if (b.tooLarge) return res.status(413).json({ error: "Body too large" });
  if (b.bad) return res.status(400).json({ error: "Body must be valid JSON" });

  const { row, error } = parseFeedback(b.data);
  if (error) return res.status(400).json({ error });

  try {
    const result = await query(
      `INSERT INTO check_feedback (check_id, helpful, comment)
       SELECT $1, $2, $3 WHERE EXISTS (
         SELECT 1 FROM coverage_checks WHERE id = $1 AND created_at > now() - interval '1 day')
       ON CONFLICT (check_id) DO UPDATE
         SET helpful = EXCLUDED.helpful, comment = EXCLUDED.comment, created_at = now()`,
      [id, row.helpful, row.comment]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Check not found" });
    res.status(201).json({ stored: true });
  } catch (err) {
    console.error("Insert feedback failed:", err.message);
    res.status(500).json({ error: "Could not store the feedback" });
  }
}
