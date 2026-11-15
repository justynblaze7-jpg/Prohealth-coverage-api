// GET /api/export.csv?days=30&channel=agent   (header X-Staff-Key)
// Every stored field, for Excel. /api/export.csv is routed here by vercel.json.
import { isConfigured } from "../lib/db.js";
import { exportCsv } from "../lib/insights.js";
import { allow, staffOnly, reportOptions } from "../lib/http.js";

export default async function handler(req, res) {
  if (!allow(req, res, "GET")) return;
  if (!staffOnly(req, res)) return;
  if (!isConfigured()) return res.status(503).json({ error: "Database not configured" });
  try {
    const opts = reportOptions(req);
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="coverage-checks-${day}-last-${opts.days}-days.csv"`);
    res.status(200).send(await exportCsv(opts));
  } catch (err) {
    console.error("Export failed:", err.message);
    res.status(500).json({ error: "Could not export checks" });
  }
}
