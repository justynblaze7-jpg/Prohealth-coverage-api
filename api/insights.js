// GET /api/insights?days=30&channel=enrollee   (header X-Staff-Key)
// Staff dashboard data: summary, daily counts, top services, unanswered, not covered, latest checks.
import { isConfigured } from "../lib/db.js";
import { buildInsights } from "../lib/insights.js";
import { allow, staffOnly, reportOptions } from "../lib/http.js";

export default async function handler(req, res) {
  if (!allow(req, res, "GET")) return;
  if (!staffOnly(req, res)) return;
  if (!isConfigured()) return res.status(200).json({ configured: false, rows: [] });
  try {
    res.status(200).json(await buildInsights(reportOptions(req)));
  } catch (err) {
    console.error("Insights failed:", err.message);
    res.status(500).json({ error: "Could not read checks" });
  }
}
