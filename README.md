# ProHealth Coverage Checker API

The backend for **Can I Use My Plan?** It stores every coverage check anonymously, records "Was this helpful?" answers, and serves the staff dashboard and CSV export.

Built with Node.js (Express) and PostgreSQL, for Render.

## What it stores

**`coverage_checks`**, one row per check:

| Field | Example | Meaning |
| --- | --- | --- |
| `id`, `created_at` | 57, 2026-11-16 09:14 | Row number and time |
| `query_text` | mri scan | What was typed (120 characters max; phone numbers, IDs and emails replaced with `[number]`, `[id]`, `[email]`) |
| `plan_id`, `plan_name` | ruby, Ruby | Plan selected |
| `service_id`, `service_name`, `benefit_section` | s80, MRI, Radiology | Benefit matched (empty if nothing matched) |
| `status` | lim | `ok` Covered · `lim` Covered with a limit · `no` Not covered · `gap` Not stated · `unk` Couldn't find it |
| `answer_text` | Up to ₦200,000 | The limit or wording shown |
| `match_method` | chip | `search`, `suggestion` or `chip` (a quick button) |
| `channel` | agent | `enrollee`, `agent`, `staff` or `test` (from `?ch=` in the link) |
| `source` | qr | Where the visitor came from (from `?src=` in the link): `qr`, `app`, `whatsapp`, `hr`, `webinar`, `direct` |
| `session_id` | random UUID | Per browser tab, to count unique visitors. Not linked to any person. |
| `device` | mobile | `mobile`, `tablet`, `desktop` (the browser details themselves are not stored) |
| `data_version` | 2026 | Which plan schedule gave the answer |

**`check_feedback`**: `check_id`, `helpful` (true/false), optional `comment`, `created_at`.

No names, member numbers, phone numbers, emails or IP addresses are stored.

## Endpoints

| Method | Path | Who | What |
| --- | --- | --- | --- |
| GET | `/health` | Anyone | `{ ok: true, db: "up" }` when the database is reachable |
| POST | `/api/checks` | The checker page | Stores one check, returns `{ id }` |
| POST | `/api/checks/:id/feedback` | The checker page | `{ "helpful": true }`; a second answer replaces the first (within 24 hours) |
| GET | `/api/insights?days=30&channel=enrollee` | Staff (header `X-Staff-Key`) | Summary, daily counts, top services, unanswered questions, not-covered requests, by plan, by channel, by source, latest 1,000 checks |
| GET | `/api/export.csv?days=30` | Staff (header `X-Staff-Key`) | Every field, for Excel |

`/api/log` is kept as another name for `/api/checks`.

**Protection:** only the web addresses in `ALLOWED_ORIGINS` can call it from a browser; 60 writes a minute per visitor; staff routes need the staff key; request bodies are capped at 10 KB; CSV cells are guarded against spreadsheet formula injection.

## Deploy on Render

### Option A: Blueprint (fastest)
1. Push this folder to its own GitHub repository.
2. In Render: **New → Blueprint**, choose the repository. Render reads `render.yaml` and creates the API and the database together.
3. When asked for `ALLOWED_ORIGINS`, enter the checker's address, e.g. `https://prohealth-coverage-checker.vercel.app` (comma-separate several; no slash at the end).
4. When it's live, open **prohealth-coverage-api → Environment** and copy `STAFF_KEY`. Share it only with staff.
5. Visit `https://<your-api>.onrender.com/health`. You should see `{"ok":true,"db":"up"}`.

### Option B: By hand
1. **New → Postgres**: name `prohealth-coverage-db`, region Frankfurt. Copy its **Internal Database URL**.
2. **New → Web Service** from the repository: runtime Node, build `npm ci`, start `npm start`, health check path `/health`, same region.
3. Environment variables: `DATABASE_URL` (the internal URL), `STAFF_KEY` (a long random value), `ALLOWED_ORIGINS`, `REPORT_TIMEZONE=Africa/Lagos`.

The tables are created automatically on first start.

## Connect the checker page
In the checker's `index.html`, set the one line near the top:
```html
<meta name="api-base" content="https://prohealth-coverage-api.onrender.com">
```
Use your real Render address. Redeploy the page.

## Free plan limits (important before go-live)
- **Free Postgres expires 30 days after it is created** and has no backups. Upgrade the database to a paid plan before enrollees use the checker, or the data will be lost.
- **A free web service sleeps after 15 minutes without traffic** and takes about a minute to wake. Checks still save, just late; the staff dashboard's first load may be slow. A paid instance stays awake.

Source: [Render: Deploy for Free](https://render.com/docs/free).

## Run locally
```bash
cp .env.example .env    # fill in DATABASE_URL and STAFF_KEY
npm install
node --env-file=.env src/server.js
npm test                # input-cleaning tests
```

## Useful links for each audience
- Enrollees from a QR code: `https://<checker>/?src=qr`
- From the app: `https://<checker>/?src=app`
- Call centre agents during the pilot: `https://<checker>/?ch=agent`

The staff dashboard can then filter enrollees and agents separately.
