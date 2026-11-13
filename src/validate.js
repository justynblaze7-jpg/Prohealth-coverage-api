// Input cleaning. Everything a browser sends is treated as untrusted.

export const STATUSES = new Set(["ok", "lim", "no", "gap", "unk"]);
export const METHODS = new Set(["search", "suggestion", "chip"]);
export const CHANNELS = new Set(["enrollee", "agent", "staff", "test"]);

const CONTROL = /[\u0000-\u001f\u007f]/g;

/** Trim, drop control characters, cap length. Returns "" for anything empty. */
export function text(value, max) {
  return String(value ?? "").replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Remove anything that looks like personal data before it is stored:
 * emails, phone numbers, member or ID numbers (any run of 6+ digits,
 * with or without spaces, dashes or slashes between them).
 * Coverage questions never need these, so nothing useful is lost.
 */
export function scrub(value) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s\-/]{4,}\d/g, (m) => (m.replace(/\D/g, "").length >= 6 ? "[number]" : m))
    .replace(/\b[A-Z]{2,5}[\/-]?\d{3,}[\/-]?\d*\b/g, "[id]");
}

/** Short identifier such as a plan id or service id: letters, digits, - and _ only. */
export function slug(value, max = 40) {
  const s = text(value, max).toLowerCase();
  return /^[a-z0-9_-]+$/.test(s) ? s : "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const uuid = (value) => (UUID.test(String(value ?? "")) ? String(value).toLowerCase() : null);

/** Coarse device type from the User-Agent header. The header itself is not stored. */
export function deviceFrom(userAgent = "") {
  if (!userAgent) return "unknown";
  if (/iPad|Tablet|Tab\b/i.test(userAgent)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(userAgent)) return "mobile";
  return "desktop";
}

/**
 * Validate a coverage check sent by the page.
 * Returns { row } on success or { error } describing the first problem.
 */
export function parseCheck(body, userAgent) {
  const b = body && typeof body === "object" ? body : {};

  const query_text = scrub(text(b.q ?? b.query_text, 120));
  if (!query_text) return { error: "q (what the person typed) is required" };

  const status = text(b.status, 5);
  if (!STATUSES.has(status)) return { error: "status must be one of ok, lim, no, gap, unk" };

  const plan_id = slug(b.plan ?? b.plan_id);
  if (!plan_id) return { error: "plan is required" };
  const plan_name = text(b.plan_name, 40) || plan_id;

  const service_id = status === "unk" ? null : slug(b.service ?? b.service_id, 20) || null;
  const service_name = service_id ? text(b.service_name, 160) || null : null;
  const benefit_section = service_id ? text(b.section ?? b.benefit_section, 80) || null : null;
  const answer_text = status === "unk" ? null : text(b.answer ?? b.answer_text, 200) || null;

  const method = text(b.method ?? b.match_method, 12);
  const match_method = METHODS.has(method) ? method : "search";

  const ch = text(b.channel, 10);
  const channel = CHANNELS.has(ch) ? ch : "enrollee";

  const source = slug(b.source, 24) || "direct";
  const session_id = uuid(b.session ?? b.session_id);
  const data_version = text(b.data_version, 20) || null;

  return {
    row: {
      query_text, plan_id, plan_name, service_id, service_name, benefit_section,
      status, answer_text, match_method, channel, source, session_id,
      device: deviceFrom(userAgent), data_version,
    },
  };
}

export function parseFeedback(body) {
  const b = body && typeof body === "object" ? body : {};
  if (typeof b.helpful !== "boolean") return { error: "helpful must be true or false" };
  const comment = scrub(text(b.comment, 300)) || null;
  return { row: { helpful: b.helpful, comment } };
}
