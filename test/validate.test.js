import { test } from "node:test";
import assert from "node:assert/strict";
import { scrub, parseCheck, parseFeedback, deviceFrom } from "../lib/validate.js";

test("scrub removes phone numbers, ids and emails", () => {
  assert.equal(scrub("call 0803 123 4567"), "call [number]");
  assert.equal(scrub("+2348031234567 please"), "[number] please");
  assert.equal(scrub("member PHM/123456"), "member PHM/[number]");
  assert.equal(scrub("card PHM1234"), "card [id]");
  assert.equal(scrub("mail me at ada@example.com"), "mail me at [email]");
});

test("scrub keeps ordinary coverage questions", () => {
  for (const q of ["MRI", "2 scans", "glasses up to 20,000", "CT scan", "physio 6 sessions", "ivf"]) {
    assert.equal(scrub(q), q);
  }
});

test("parseCheck accepts a full check", () => {
  const { row, error } = parseCheck(
    { q: "mri", plan: "Ruby", plan_name: "Ruby", service: "s80", service_name: "MRI", status: "lim", method: "chip", channel: "agent", source: "qr" },
    "iPhone"
  );
  assert.equal(error, undefined);
  assert.equal(row.plan_id, "ruby");
  assert.equal(row.device, "mobile");
  assert.equal(row.match_method, "chip");
});

test("parseCheck drops the service for unanswered checks and rejects bad input", () => {
  assert.equal(parseCheck({ q: "dialysis", plan: "pearl", status: "unk", service: "s1" }).row.service_id, null);
  assert.ok(parseCheck({ q: "", plan: "pearl", status: "ok" }).error);
  assert.ok(parseCheck({ q: "mri", plan: "pearl", status: "maybe" }).error);
  assert.ok(parseCheck({ q: "mri", plan: "<script>", status: "ok" }).error);
});

test("unknown channel and method fall back to safe defaults", () => {
  const { row } = parseCheck({ q: "mri", plan: "ruby", status: "ok", channel: "admin", method: "hack" });
  assert.equal(row.channel, "enrollee");
  assert.equal(row.match_method, "search");
});

test("feedback needs a true or false answer", () => {
  assert.ok(parseFeedback({ helpful: "yes" }).error);
  assert.equal(parseFeedback({ helpful: false }).row.helpful, false);
});

test("device detection", () => {
  assert.equal(deviceFrom("Mozilla/5.0 (Linux; Android 14) Mobile"), "mobile");
  assert.equal(deviceFrom("Mozilla/5.0 (iPad; CPU OS 17)"), "tablet");
  assert.equal(deviceFrom("Mozilla/5.0 (Windows NT 10.0)"), "desktop");
  assert.equal(deviceFrom(""), "unknown");
});

test("parseCheck takes the organisation from the server's list, not the browser", () => {
  const { row } = parseCheck({ q: "mri", plan: "ruby", status: "ok", service: "s80", org: "1064", org_name: "Fake Name" }, "");
  assert.equal(row.org_id, 1064);
  assert.equal(row.org_name, "ProHealth HMO Limited");
  assert.equal(row.org_region, "North Central");
  const none = parseCheck({ q: "mri", plan: "ruby", status: "ok", org: "999999" }, "").row;
  assert.equal(none.org_id, null);
  assert.equal(none.org_name, null);
});

test("parseCheck keeps the time an offline check was made, within limits", () => {
  const t = Date.now() - 3 * 864e5;
  assert.equal(parseCheck({ q: "mri", plan: "ruby", status: "unk", ts: t }, "").row.created_at, new Date(t).toISOString());
  assert.equal("created_at" in parseCheck({ q: "mri", plan: "ruby", status: "unk", ts: Date.now() + 864e5 }, "").row, false);
  assert.equal("created_at" in parseCheck({ q: "mri", plan: "ruby", status: "unk", ts: Date.now() - 60 * 864e5 }, "").row, false);
  assert.equal("created_at" in parseCheck({ q: "mri", plan: "ruby", status: "unk" }, "").row, false);
});
