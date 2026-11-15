import { timingSafeEqual } from "node:crypto";
import { CHANNELS } from "./validate.js";

/** Only allow the listed methods; answers 405 otherwise. Returns true when allowed. */
export function allow(req, res, ...methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  res.status(405).json({ error: `Use ${methods.join(" or ")}` });
  return false;
}

/** Vercel parses JSON bodies; this also handles a raw string and rejects oversized bodies. */
export function body(req) {
  const len = Number(req.headers["content-length"] || 0);
  if (len > 10_000) return { tooLarge: true };
  if (typeof req.body === "string") {
    try { return { data: JSON.parse(req.body) }; } catch { return { bad: true }; }
  }
  return { data: req.body || {} };
}

/** Staff routes need the X-Staff-Key header to match the STAFF_KEY environment variable. */
export function staffOnly(req, res) {
  const key = process.env.STAFF_KEY || "";
  const given = Buffer.from(String(req.headers["x-staff-key"] || ""));
  const expected = Buffer.from(key);
  const ok = key.length >= 5 && given.length === expected.length && timingSafeEqual(given, expected);
  if (!ok) {
    res.status(401).json({ error: "Staff key required" });
    return false;
  }
  res.setHeader("Cache-Control", "no-store");
  return true;
}

export function reportOptions(req) {
  const days = Math.min(366, Math.max(1, parseInt(req.query.days, 10) || 30));
  const ch = String(req.query.channel || "");
  return { days, channel: CHANNELS.has(ch) ? ch : null };
}

/**
 * Light per-instance rate limit (60 writes a minute per visitor).
 * Serverless instances don't share memory, so this is a first line of defence only;
 * add a Vercel Firewall rate-limit rule for stronger protection.
 */
const hits = new Map();
export function rateLimited(req, res, limit = Number(process.env.WRITE_LIMIT_PER_MIN || 60)) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > 60_000) {
    hits.set(ip, { start: now, count: 1 });
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > 60_000) hits.delete(k);
    return false;
  }
  entry.count += 1;
  if (entry.count > limit) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
    return true;
  }
  return false;
}
