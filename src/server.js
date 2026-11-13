import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { timingSafeEqual } from "node:crypto";
import { migrate, query, pool } from "./db.js";
import { parseCheck, parseFeedback, CHANNELS } from "./validate.js";
import { buildInsights, exportCsv } from "./insights.js";

const PORT = Number(process.env.PORT || 10000);
const STAFF_KEY = process.env.STAFF_KEY || "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);

if (STAFF_KEY.length < 12) {
  console.warn("STAFF_KEY is missing or shorter than 12 characters. Staff insights stay locked until it is set.");
}
if (!ALLOWED_ORIGINS.length) {
  console.warn("ALLOWED_ORIGINS is empty. Browsers on other sites will be blocked from calling this API.");
}

const app = express();
app.set("trust proxy", 1); // Render sits in front of the app; this gives real client IPs for rate limiting.
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "10kb" }));

// Only the checker's own website may call the API from a browser.
app.use(
  cors({
    origin(origin, done) {
      if (!origin) return done(null, true); // curl, server-to-server, health checks
      done(null, ALLOWED_ORIGINS.includes(origin));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "X-Staff-Key"],
    maxAge: 86400,
  })
);

const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.WRITE_LIMIT_PER_MIN || 60),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a minute and try again." },
});
const staffLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a minute and try again." },
});

function staffOnly(req, res, next) {
  const given = Buffer.from(String(req.get("x-staff-key") || ""));
  const expected = Buffer.from(STAFF_KEY);
  const ok = STAFF_KEY.length >= 12 && given.length === expected.length && timingSafeEqual(given, expected);
  if (!ok) return res.status(401).json({ error: "Staff key required" });
  res.set("Cache-Control", "no-store");
  next();
}

function reportOptions(req) {
  const days = Math.min(366, Math.max(1, parseInt(req.query.days, 10) || 30));
  const ch = String(req.query.channel || "");
  return { days, channel: CHANNELS.has(ch) ? ch : null };
}

// ---------- Routes ----------

app.get("/", (_req, res) => res.json({ service: "ProHealth Coverage Checker API", status: "ok" }));

app.get("/health", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({ ok: true, db: "up" });
  } catch {
    res.status(503).json({ ok: false, db: "down" });
  }
});

// Record one coverage check. Returns its id so the page can attach feedback.
async function createCheck(req, res) {
  const { row, error } = parseCheck(req.body, req.get("user-agent"));
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
app.post("/api/checks", writeLimiter, createCheck);
app.post("/api/log", writeLimiter, createCheck); // same as /api/checks, kept for older pages

// "Was this helpful?" for a check. Sending again replaces the earlier answer.
app.post("/api/checks/:id/feedback", writeLimiter, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid check id" });
  const { row, error } = parseFeedback(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const result = await query(
      `INSERT INTO check_feedback (check_id, helpful, comment)
       SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM coverage_checks WHERE id = $1 AND created_at > now() - interval '1 day')
       ON CONFLICT (check_id) DO UPDATE SET helpful = EXCLUDED.helpful, comment = EXCLUDED.comment, created_at = now()`,
      [id, row.helpful, row.comment]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Check not found" });
    res.status(201).json({ stored: true });
  } catch (err) {
    console.error("Insert feedback failed:", err.message);
    res.status(500).json({ error: "Could not store the feedback" });
  }
});

// Staff dashboard data. ?days=30 (1 to 366), ?channel=enrollee|agent|staff|test
app.get("/api/insights", staffLimiter, staffOnly, async (req, res) => {
  try {
    res.json(await buildInsights(reportOptions(req)));
  } catch (err) {
    console.error("Insights failed:", err.message);
    res.status(500).json({ error: "Could not read checks" });
  }
});

// Full export for reports. Same filters as /api/insights.
app.get("/api/export.csv", staffLimiter, staffOnly, async (req, res) => {
  try {
    const opts = reportOptions(req);
    const day = new Date().toISOString().slice(0, 10);
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="coverage-checks-${day}-last-${opts.days}-days.csv"`);
    res.send(await exportCsv(opts));
  } catch (err) {
    console.error("Export failed:", err.message);
    res.status(500).json({ error: "Could not export checks" });
  }
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Bad JSON and anything unexpected end here, without leaking details.
app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Body must be valid JSON" });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Body too large" });
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Something went wrong" });
});

// ---------- Start ----------

try {
  await migrate();
  console.log("Database schema is up to date.");
} catch (err) {
  console.error("Could not prepare the database:", err.message);
  process.exit(1);
}

const server = app.listen(PORT, () => console.log(`Coverage Checker API listening on port ${PORT}`));

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
  });
}
