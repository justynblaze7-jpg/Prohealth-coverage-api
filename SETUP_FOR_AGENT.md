# Setup guide for the deploying agent: ProHealth Coverage Checker API on Render

This guide is written for an AI agent with access to Daniel's **GitHub**, **Render** and **Vercel** accounts. Follow the steps in order. Do not skip the checks at the end of each step. Report back to Daniel using the template in Step 7.

---

## What you are deploying

The **Coverage Checker** is a web page where ProHealth HMO enrollees check whether a service is covered on their plan. It has two parts:

| Part | Folder / zip | Hosted on | Role |
| --- | --- | --- | --- |
| Backend API | `prohealth-coverage-api` | **Render** (Node web service + Postgres) | Stores each coverage check and feedback; serves the staff dashboard data and CSV export |
| Frontend page | `prohealth-coverage-checker` | **Vercel** (already live at `https://prohealth-coverage-checker.vercel.app`) | The page enrollees and agents use; sends each check to the API |

You will:
1. Put the backend code in a new GitHub repository.
2. Create a Postgres database on Render.
3. Create a Node web service on Render, connected to that repository and database.
4. Test the API.
5. Update the frontend on GitHub and Vercel so it sends data to the API.
6. Test the whole flow end to end.
7. Hand Daniel the results and the staff key.

---

## Rules you must follow

1. **Never put secrets in GitHub.** `STAFF_KEY` and `DATABASE_URL` live only in Render's environment variables. Do not create a `.env` file in any repository.
2. **Show the staff key to Daniel only once**, in your final report. Do not write it into code, commit messages, issues, logs or file contents.
3. **Do not choose paid plans or upgrade anything** without Daniel's explicit approval. Use the **Free** plan for both the database and the web service.
4. **Do not delete, rename or reconfigure** any existing Render service, database, Vercel project or GitHub repository, except the frontend repository changes listed in Step 5.
5. **Keep the database and the web service in the same region (Frankfurt).** The internal database address only works within one region.
6. **Do not change the application code** except the one line in Step 5.3. If something fails, use the Troubleshooting table and report instead of rewriting code.
7. If a connector cannot perform a step, **stop and tell Daniel exactly which step** and what to click in the dashboard. Do not guess or skip.

---

## Before you start

Confirm you have:

- [ ] The file **`prohealth-coverage-api.zip`** (backend code)
- [ ] The file **`prohealth-coverage-checker.zip`** (updated frontend code)
- [ ] Access to Daniel's GitHub account, and the name of the GitHub repository that Vercel deploys `prohealth-coverage-checker` from. Find it in Vercel: Project → Settings → Git.
- [ ] Access to Daniel's Render workspace
- [ ] Access to the Vercel project **prohealth-coverage-checker**

If either zip file is missing, ask Daniel to upload it before continuing.

**Backend files you should see after unzipping `prohealth-coverage-api.zip`:**

```
prohealth-coverage-api/
├── src/
│   ├── server.js        # Express app and all routes
│   ├── db.js            # Postgres connection; runs schema on start
│   ├── schema.sql       # Tables: coverage_checks, check_feedback
│   ├── insights.js      # Staff dashboard queries and CSV export
│   ├── validate.js      # Input cleaning and personal-data scrubbing
│   └── migrate.js       # Optional manual schema run
├── test/validate.test.js
├── package.json
├── package-lock.json
├── render.yaml          # Optional Render Blueprint
├── .env.example         # Variable names only, no real values
├── .gitignore
├── README.md
└── SETUP_FOR_AGENT.md   # This guide
```

`node_modules/` is not included and must not be committed. Render installs dependencies itself.

---

## Step 1: Create the backend GitHub repository

1. In Daniel's GitHub account, create a **new private repository** named **`prohealth-coverage-api`**.
   - No README, no .gitignore, no licence (the code already includes them).
   - Default branch: `main`.
2. Commit **all files from inside** the `prohealth-coverage-api` folder to the **root** of the repository. `package.json` must sit at the repository root, not inside a subfolder.
3. Commit message: `Initial commit: Coverage Checker API`

**Check before moving on:**
- [ ] The repository root shows `package.json`, `package-lock.json`, `render.yaml` and the `src/` folder.
- [ ] There is **no** `node_modules/` folder and **no** `.env` file in the repository.

---

## Step 2: Create the Postgres database on Render

Create a new **PostgreSQL** database with these exact settings:

| Setting | Value |
| --- | --- |
| Name | `prohealth-coverage-db` |
| Database | `prohealth_coverage` |
| User | `prohealth` |
| Region | **Frankfurt (EU Central)** |
| PostgreSQL version | 16 (or the newest Render offers) |
| Plan | **Free** |

Wait until its status is **Available**.

From the database's **Connections** (or Info) section, copy the **Internal Database URL**. It starts with `postgresql://` and its host has **no** `.render.com` ending. You need it in Step 3. Do not share it in chat or commit it.

**Write down the database's creation date.** Free Render databases expire 30 days after creation. You will report the expiry date to Daniel.

**Check before moving on:**
- [ ] Status is Available.
- [ ] Region is Frankfurt.
- [ ] You have the Internal Database URL (not the External one).

---

## Step 3: Create the web service on Render

Create a new **Web Service** connected to the GitHub repository **`prohealth-coverage-api`**.

| Setting | Value |
| --- | --- |
| Name | `prohealth-coverage-api` |
| Repository / branch | `prohealth-coverage-api`, branch `main` |
| Root directory | leave empty (the repository root) |
| Runtime / language | **Node** |
| Region | **Frankfurt (EU Central)**, the same as the database |
| Build command | `npm ci` |
| Start command | `npm start` |
| Health check path | `/health` |
| Plan / instance type | **Free** |
| Auto-deploy | On (deploy on every push to `main`) |

**Environment variables** (add all five before the first deploy):

| Key | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `DATABASE_URL` | The **Internal Database URL** from Step 2 |
| `STAFF_KEY` | A new random string of **at least 32 characters** (letters and digits). Use Render's "Generate" option if offered; otherwise generate one securely. |
| `ALLOWED_ORIGINS` | `https://prohealth-coverage-checker.vercel.app` |
| `REPORT_TIMEZONE` | `Africa/Lagos` |

Notes on `ALLOWED_ORIGINS`:
- No trailing slash.
- If the frontend also has a custom domain, add it with a comma and no spaces, e.g. `https://prohealth-coverage-checker.vercel.app,https://check.prohealthhmo.com`.
- Vercel preview addresses are not included on purpose. The live site is the only address that should send data.

Start the deploy and wait until it shows **Live**.

**Alternative:** if your Render connector supports **Blueprints**, you may instead create a Blueprint from the repository. It reads `render.yaml` and creates both the database and the web service with the settings above. You must still enter `ALLOWED_ORIGINS` when asked. Then go straight to the checks below.

**Check before moving on:**
- [ ] The deploy log shows `Database schema is up to date.` and `Coverage Checker API listening on port ...`
- [ ] The service status is **Live**.
- [ ] Note the service address, e.g. `https://prohealth-coverage-api.onrender.com`. It is written as `API` below.

---

## Step 4: Test the API

Run each request and compare it with the expected result. Replace `API` with the real address and `STAFF_KEY` with the key you set. If you cannot send HTTP requests yourself, give Daniel these commands to run, or check what you can through Render's logs.

The first request may take about a minute if the free service was asleep. That is normal.

**4.1 Health**
```bash
curl API/health
```
Expected: `{"ok":true,"db":"up"}`

**4.2 Store a test check** (marked `channel: test` so it can be filtered out of reports)
```bash
curl -X POST API/api/checks \
  -H "Content-Type: application/json" \
  -d '{"q":"agent setup test","plan":"ruby","plan_name":"Ruby","service":"s80","service_name":"MRI","section":"Radiology","status":"lim","answer":"Setup test","method":"search","channel":"test","source":"setup"}'
```
Expected: `{"stored":true,"id":<number>}`. Note the id.

**4.3 Store feedback for that check** (use the id from 4.2)
```bash
curl -X POST API/api/checks/<id>/feedback \
  -H "Content-Type: application/json" -d '{"helpful":true}'
```
Expected: `{"stored":true}`

**4.4 Staff data is locked without the key**
```bash
curl API/api/insights
```
Expected: `{"error":"Staff key required"}` with status 401.

**4.5 Staff data works with the key**
```bash
curl -H "X-Staff-Key: STAFF_KEY" "API/api/insights?days=1&channel=test"
```
Expected: JSON with `"configured":true` and `summary.total` of at least 1.

**4.6 The browser permission (CORS) is set correctly**
```bash
curl -i -X OPTIONS API/api/checks \
  -H "Origin: https://prohealth-coverage-checker.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
```
Expected: status 204 and a header `access-control-allow-origin: https://prohealth-coverage-checker.vercel.app`.

**4.7 Personal data is scrubbed**
```bash
curl -X POST API/api/checks -H "Content-Type: application/json" \
  -d '{"q":"call me 08031234567","plan":"ruby","status":"unk","channel":"test","source":"setup"}'
curl -H "X-Staff-Key: STAFF_KEY" "API/api/insights?days=1&channel=test"
```
Expected: in the second response, the question reads `call me [number]`.

**Check before moving on:**
- [ ] All seven tests gave the expected result.

---

## Step 5: Update the page on GitHub and Vercel

The live page currently uses old Vercel functions. Replace it with the new version that talks to the Render API.

**5.1 Find the frontend repository.** In Vercel: project **prohealth-coverage-checker** → Settings → Git. Note the connected GitHub repository and production branch.

**5.2 Replace the files.** In that repository, on the production branch:
- **Delete** the folder `api/` (contains `log.js`, `insights.js`, `_redis.js`) and the file `package.json`, if present.
- **Replace** `index.html`, `plans.json`, `README.md`, `vercel.json`, `.gitignore` and `scripts/build_plans.py` with the versions from `prohealth-coverage-checker.zip`.
- Do not add any other files.

**5.3 Set the API address.** In `index.html`, near the top, find:
```html
<meta name="api-base" content="https://prohealth-coverage-api.onrender.com">
```
Make sure `content` matches the real Render service address from Step 3 exactly, with `https://` and **no** trailing slash. This is the only code change you are allowed to make.

**5.4 Commit** with the message `Connect checker to Render API` and push. Vercel redeploys automatically. Wait until the Vercel deployment shows **Ready**.

**5.5 Remove unused Vercel settings (only if present).** In Vercel → project → Settings → Environment Variables, the old variables `STAFF_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `KV_REST_API_URL` and `KV_REST_API_TOKEN` are no longer used. **Do not delete them.** List them in your report so Daniel can decide.

**Check before moving on:**
- [ ] The Vercel deployment is Ready.
- [ ] The repository no longer has an `api/` folder.
- [ ] `index.html` contains the correct `api-base` address.

---

## Step 6: End-to-end check

1. Open `https://prohealth-coverage-checker.vercel.app/?ch=test&src=setup`.
2. Pick **Ruby**, type **mri**, press **Check**. A result card appears.
3. Under the result, tap **Yes** for "Was this answer helpful?"
4. Type **covid test** and press **Check**. The page should say it couldn't find this.
5. Open `https://prohealth-coverage-checker.vercel.app/#insights`, enter the staff key, and choose **Who: Everyone**, **Period: Last 7 days**.
6. Confirm the two checks from this step appear under **Recent checks**, and that **covid test** appears under **Questions the page couldn't answer**.
7. Press **Download CSV** and confirm a file downloads.
8. Press **Sign out**.

If the dashboard says "Couldn't reach the insights service", see the Troubleshooting table.

**Check:**
- [ ] All eight items worked.

---

## Step 7: Report back to Daniel

Send Daniel a message using this template. Fill in every line.

```
Coverage Checker API: setup complete

API address:            https://...onrender.com
Health check:           https://...onrender.com/health  -> {"ok":true,"db":"up"}
Backend repository:     github.com/<owner>/prohealth-coverage-api (private)
Database:               prohealth-coverage-db, Frankfurt, Free plan
Database created on:    <date>
Free database expires:  <date + 30 days>  (upgrade before go-live or data is lost)
Web service plan:       Free (sleeps after 15 minutes idle; first request takes about 1 minute)
Frontend:               https://prohealth-coverage-checker.vercel.app, redeployed and connected
Allowed origins:        <value of ALLOWED_ORIGINS>

STAFF KEY (keep private; needed for /#insights):
<the key>

Tests:
  API tests 4.1 to 4.7:    passed / failed (details)
  End-to-end 1 to 8:       passed / failed (details)

Test data: rows with channel "test" were created during setup.
           Choose "Who: Enrollees" or "Call centre agents" in the dashboard to exclude them.

Old Vercel variables no longer used (not deleted): <list or "none">

Links to share:
  Agents (pilot):     https://prohealth-coverage-checker.vercel.app/?ch=agent
  Enrollees by QR:    https://prohealth-coverage-checker.vercel.app/?src=qr
  Staff dashboard:    https://prohealth-coverage-checker.vercel.app/#insights

Needs Daniel's decision:
  - Upgrade database to a paid plan before go-live (free expires on the date above)
  - Optional: paid web service instance so the API never sleeps
```

---

## Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Deploy log: `DATABASE_URL is not set` | Variable missing | Add `DATABASE_URL` in the web service's Environment and redeploy |
| Deploy log: `Could not prepare the database` or connection timeout | External URL used, or different regions | Use the **Internal** Database URL; confirm both are in Frankfurt |
| Deploy log: `npm ci` fails, lockfile error | `package-lock.json` missing from the repository | Commit `package-lock.json` from the zip to the repository root |
| Build cannot find `package.json` | Files committed inside a subfolder | Move all files to the repository root, or set Root Directory to that subfolder |
| `/health` returns `{"ok":false,"db":"down"}` | Database not ready or wrong URL | Wait for the database to be Available; recheck `DATABASE_URL` |
| `/api/insights` returns 401 with the key | Key mismatch or under 12 characters | Copy `STAFF_KEY` exactly from Render; no spaces |
| Page works but nothing is saved; browser console shows a CORS error | `ALLOWED_ORIGINS` doesn't match the page address | Set it to exactly `https://prohealth-coverage-checker.vercel.app` (no trailing slash) and redeploy the API |
| Page shows "Couldn't reach the insights service" | Wrong `api-base` in `index.html`, or the API is asleep | Check the `api-base` line; wait one minute and reload |
| Requests return 429 | Rate limit (60 writes per minute per visitor) | Wait one minute; this is expected protection |
| First request takes about a minute | Free service was asleep | Normal on the Free plan |

If a problem is not in this table, stop and report the exact error message and the step number to Daniel. Do not change the application code.

---

## Reference: what the API stores

**`coverage_checks`**: `id`, `created_at`, `query_text` (scrubbed of phone numbers, IDs and emails), `plan_id`, `plan_name`, `service_id`, `service_name`, `benefit_section`, `status` (`ok`, `lim`, `no`, `gap`, `unk`), `answer_text`, `match_method` (`search`, `suggestion`, `chip`), `channel` (`enrollee`, `agent`, `staff`, `test`), `source`, `session_id` (random per browser tab), `device` (`mobile`, `tablet`, `desktop`), `data_version`.

**`check_feedback`**: `check_id`, `helpful`, `comment`, `created_at`.

No names, member numbers, phone numbers, emails or IP addresses are stored. Tables are created automatically when the service starts.

**Endpoints:** `GET /health`; `POST /api/checks`; `POST /api/checks/:id/feedback`; `GET /api/insights?days=&channel=` (staff key); `GET /api/export.csv?days=&channel=` (staff key).
