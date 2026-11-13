-- ProHealth Coverage Checker: database schema.
-- Safe to run many times: every statement uses IF NOT EXISTS.
-- No names, member numbers, phone numbers or emails are stored.

CREATE TABLE IF NOT EXISTS coverage_checks (
  id               BIGSERIAL PRIMARY KEY,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- What the person typed (max 120 characters, scrubbed of numbers and emails)
  query_text       TEXT        NOT NULL,

  -- Plan selected
  plan_id          TEXT        NOT NULL,          -- e.g. ruby
  plan_name        TEXT        NOT NULL,          -- e.g. Ruby

  -- Benefit the page matched (all null when nothing matched)
  service_id       TEXT,                          -- id from plans.json, e.g. s80
  service_name     TEXT,                          -- e.g. MRI
  benefit_section  TEXT,                          -- e.g. Radiology

  -- The answer shown
  status           TEXT        NOT NULL
                   CHECK (status IN ('ok','lim','no','gap','unk')),
                   -- ok = Covered, lim = Covered with a limit, no = Not covered,
                   -- gap = Not stated in the schedule, unk = Could not find it
  answer_text      TEXT,                          -- the limit or wording shown, e.g. "Up to ₦200,000"

  -- How the answer was reached
  match_method     TEXT        NOT NULL DEFAULT 'search'
                   CHECK (match_method IN ('search','suggestion','chip')),

  -- Who and where from (no identity)
  channel          TEXT        NOT NULL DEFAULT 'enrollee'
                   CHECK (channel IN ('enrollee','agent','staff','test')),
  source           TEXT        NOT NULL DEFAULT 'direct',   -- qr, app, whatsapp, hr, webinar, direct ...
  session_id       UUID,                          -- random per browser tab; counts unique visitors only
  device           TEXT        NOT NULL DEFAULT 'unknown'
                   CHECK (device IN ('mobile','tablet','desktop','unknown')),
  data_version     TEXT                           -- which plan schedule answered, e.g. 2026
);

CREATE INDEX IF NOT EXISTS coverage_checks_created_idx ON coverage_checks (created_at DESC);
CREATE INDEX IF NOT EXISTS coverage_checks_status_idx  ON coverage_checks (status, created_at DESC);
CREATE INDEX IF NOT EXISTS coverage_checks_service_idx ON coverage_checks (service_id);
CREATE INDEX IF NOT EXISTS coverage_checks_channel_idx ON coverage_checks (channel, created_at DESC);

-- "Was this answer helpful?" One answer per check; a later answer replaces the earlier one.
CREATE TABLE IF NOT EXISTS check_feedback (
  check_id    BIGINT      PRIMARY KEY REFERENCES coverage_checks (id) ON DELETE CASCADE,
  helpful     BOOLEAN     NOT NULL,
  comment     TEXT,                               -- optional, max 300 characters, scrubbed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
