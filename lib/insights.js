import { query } from "./db.js";

// Days are counted in Lagos time so "today" matches the call centre's day.
const TZ = process.env.REPORT_TIMEZONE || "Africa/Lagos";

/**
 * Builds the WHERE clause shared by every insights query.
 * days: how far back to look (1 to 366). channel: optional filter.
 */
function filters({ days, channel }) {
  const params = [days];
  let where = "c.created_at >= now() - ($1::int * interval '1 day')";
  if (channel) {
    params.push(channel);
    where += ` AND c.channel = $${params.length}`;
  }
  return { where, params };
}

export async function buildInsights(opts) {
  const { where, params } = filters(opts);
  const tzParam = params.length + 1;

  const [summary, daily, topServices, unanswered, notCovered, byPlan, byChannel, bySource, recent] =
    await Promise.all([
      query(
        `SELECT
           count(*)::int                                         AS total,
           count(*) FILTER (WHERE c.status <> 'unk')::int        AS answered,
           count(*) FILTER (WHERE c.status = 'unk')::int         AS unanswered,
           count(*) FILTER (WHERE c.status = 'no')::int          AS not_covered,
           count(*) FILTER (WHERE c.status = 'gap')::int         AS not_stated,
           count(DISTINCT c.session_id)::int                     AS visitors,
           count(f.check_id) FILTER (WHERE f.helpful)::int       AS helpful_yes,
           count(f.check_id) FILTER (WHERE NOT f.helpful)::int   AS helpful_no
         FROM coverage_checks c
         LEFT JOIN check_feedback f ON f.check_id = c.id
         WHERE ${where}`,
        params
      ),
      query(
        `SELECT to_char(date_trunc('day', c.created_at AT TIME ZONE $${tzParam}), 'YYYY-MM-DD') AS day,
                count(*)::int AS total,
                count(*) FILTER (WHERE c.status = 'unk')::int AS unanswered
         FROM coverage_checks c
         WHERE ${where}
         GROUP BY 1 ORDER BY 1`,
        [...params, TZ]
      ),
      query(
        `SELECT c.service_id, max(c.service_name) AS service_name, max(c.benefit_section) AS benefit_section,
                count(*)::int AS checks
         FROM coverage_checks c
         WHERE ${where} AND c.service_id IS NOT NULL
         GROUP BY c.service_id ORDER BY checks DESC LIMIT 15`,
        params
      ),
      query(
        `SELECT lower(c.query_text) AS query_text, count(*)::int AS checks, max(c.created_at) AS last_asked
         FROM coverage_checks c
         WHERE ${where} AND c.status = 'unk'
         GROUP BY 1 ORDER BY checks DESC, last_asked DESC LIMIT 25`,
        params
      ),
      query(
        `SELECT c.service_name, c.plan_name, count(*)::int AS checks
         FROM coverage_checks c
         WHERE ${where} AND c.status = 'no'
         GROUP BY 1, 2 ORDER BY checks DESC LIMIT 15`,
        params
      ),
      query(
        `SELECT c.plan_name, count(*)::int AS checks
         FROM coverage_checks c WHERE ${where}
         GROUP BY 1 ORDER BY checks DESC`,
        params
      ),
      query(
        `SELECT c.channel, count(*)::int AS checks
         FROM coverage_checks c WHERE ${where}
         GROUP BY 1 ORDER BY checks DESC`,
        params
      ),
      query(
        `SELECT c.source, count(*)::int AS checks
         FROM coverage_checks c WHERE ${where}
         GROUP BY 1 ORDER BY checks DESC`,
        params
      ),
      query(
        `SELECT c.id, c.created_at, c.query_text AS q, c.service_id AS service, c.service_name,
                c.status, c.plan_id AS plan, c.plan_name, c.channel, c.source, c.device,
                f.helpful
         FROM coverage_checks c
         LEFT JOIN check_feedback f ON f.check_id = c.id
         WHERE ${where}
         ORDER BY c.created_at DESC LIMIT 1000`,
        params
      ),
    ]);

  const s = summary.rows[0];
  return {
    configured: true,
    period_days: opts.days,
    channel: opts.channel || "all",
    generated_at: new Date().toISOString(),
    summary: {
      ...s,
      answered_rate: s.total ? Math.round((s.answered / s.total) * 1000) / 10 : null,
      helpful_rate:
        s.helpful_yes + s.helpful_no
          ? Math.round((s.helpful_yes / (s.helpful_yes + s.helpful_no)) * 1000) / 10
          : null,
    },
    daily: daily.rows,
    top_services: topServices.rows,
    unanswered: unanswered.rows,
    not_covered: notCovered.rows,
    by_plan: byPlan.rows,
    by_channel: byChannel.rows,
    by_source: bySource.rows,
    // `rows` keeps the shape the page already reads: q, service, status, plan, ts
    rows: recent.rows.map((r) => ({ ...r, ts: new Date(r.created_at).getTime() })),
  };
}

const CSV_COLUMNS = [
  "id", "created_at", "query_text", "plan_id", "plan_name", "service_id", "service_name",
  "benefit_section", "status", "answer_text", "match_method", "channel", "source",
  "session_id", "device", "data_version", "helpful", "feedback_comment",
];

function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  // Stop spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function exportCsv(opts) {
  const { where, params } = filters(opts);
  const { rows } = await query(
    `SELECT c.*, f.helpful, f.comment AS feedback_comment
     FROM coverage_checks c
     LEFT JOIN check_feedback f ON f.check_id = c.id
     WHERE ${where}
     ORDER BY c.created_at DESC LIMIT 50000`,
    params
  );
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map((k) => csvCell(r[k])).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n"; // BOM so Excel shows ₦ correctly
}
