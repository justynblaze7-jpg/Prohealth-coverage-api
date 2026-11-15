# Setup guide: Coverage Checker on Vercel + Neon

Everything now runs in **one Vercel project**: the checker page and its API (in the `api/` folder). The data is stored in a free **Neon Postgres** database connected through Vercel. **No Render account and no card are needed.**

This guide works for a person or an AI agent with access to Daniel's GitHub and Vercel accounts. Follow the steps in order and complete each checklist before moving on. Time needed: about 15 minutes.

---

## Rules (for an agent)

1. Never commit secrets. `STAFF_KEY` and the database URL live only in Vercel's Environment Variables. Do not create a `.env` file in the repository.
2. Show the staff key to Daniel only once, in the final report.
3. Choose the **Free** plan everywhere. Do not upgrade or add payment details without Daniel's approval.
4. Do not delete or rename any project, database or repository.
5. Do not change application code. If a step fails, use the Troubleshooting table, then stop and report.
6. If a connector cannot do a step, stop and tell Daniel exactly which step to do by hand.

---

## What is in the project

```
prohealth-coverage-checker/
├── index.html                 # The page (checker + staff insights at /#insights)
├── plans.json                 # 2026 plan benefits (230 lines, 5 plans)
├── api/
│   ├── health.js              # GET  /api/health
│   ├── checks/index.js        # POST /api/checks           stores one check
│   ├── checks/[id]/feedback.js# POST /api/checks/:id/feedback
│   ├── insights.js            # GET  /api/insights          staff only
│   ├── export.js              # GET  /api/export.csv        staff only
│   └── log.js                 # POST /api/log               same as /api/checks
├── lib/                       # Shared code: database, validation, reports, schema
├── scripts/build_plans.py     # Rebuilds plans.json from the Excel schedule
├── test/validate.test.js
├── package.json, package-lock.json, vercel.json
├── README.md
└── SETUP.md                   # This guide
```

The database tables are created automatically the first time the API is used.

---

## Step 1: Update the GitHub repository

1. In Vercel, open the project **prohealth-coverage-checker** → **Settings** → **Git**. Note the connected GitHub repository and the production branch (usually `main`).
2. Unzip **prohealth-coverage-checker.zip**. Open the unzipped folder and upload **everything inside it** to the repository root, on the production branch (on GitHub: **Add file → Upload files**, then drag the files and folders in). Files with the same name are replaced. Do not upload the outer folder itself, and do not upload `node_modules` if it exists.
3. Commit with the message `Move API to Vercel functions with Neon`.
4. If the old file `api/_redis.js` is still in the repository, delete it (open it, click the three dots, **Delete file**, commit). It is no longer used.

Vercel starts a deployment automatically. It's fine if this first deployment works without a database; Step 2 connects it.

**Checklist**
- [ ] The repository root shows `index.html`, `package.json`, `package-lock.json`, `vercel.json`, and the folders `api/`, `lib/`, `scripts/`, `test/`.
- [ ] `api/checks/[id]/feedback.js` exists (the folder name really is `[id]`, with square brackets).
- [ ] There is no `.env` file and no `node_modules` folder.

---

## Step 2: Create the Neon database and connect it

1. In Vercel, open the project **prohealth-coverage-checker** → **Storage** tab.
2. Click **Create Database** (or **Browse Marketplace**), choose **Neon (Serverless Postgres)** and click **Continue**.
3. If asked, choose **Create New Neon Account** (Neon is billed through Vercel; the free plan needs no card).
4. Settings:

| Setting | Value |
| --- | --- |
| Region | **Europe (Frankfurt)**, `aws-eu-central-1` |
| Plan | **Free** |
| Auth | **Off** |
| Realtime | **Off** |
| Database name | `prohealth-coverage-db` |

5. Click **Create**, then **Connect Project** (if it doesn't open by itself: Storage → `prohealth-coverage-db` → **Connect Project**).
6. Choose project **prohealth-coverage-checker**, tick **Production**, **Preview** and **Development**, and **leave the custom prefix empty**. Click **Connect**.

This adds `DATABASE_URL` and related variables to the project.

**Checklist**
- [ ] Project → Settings → Environment Variables now lists `DATABASE_URL`.
- [ ] The database region is Frankfurt and the plan is Free.

---

## Step 3: Add the staff key

1. Project → **Settings** → **Environment Variables** → **Add New**.
2. Key: `STAFF_KEY`. Value: a random string of **at least 32 letters and digits**. Generate it securely; do not reuse a password.
3. Environments: tick **Production** and **Preview**. Click **Save**.

Optional variables (leave out unless needed):

| Key | Default | Purpose |
| --- | --- | --- |
| `REPORT_TIMEZONE` | `Africa/Lagos` | Time zone for daily counts |
| `WRITE_LIMIT_PER_MIN` | `60` | Checks allowed per visitor per minute |

---

## Step 4: Redeploy

New environment variables only reach the site after a new deployment.

1. Project → **Deployments**. On the latest deployment, click the three dots → **Redeploy** → **Redeploy**.
2. Wait until the status is **Ready**.

**Checklist**
- [ ] The latest deployment is Ready and was created after Steps 2 and 3.

---

## Step 5: Test

Use the live address, `https://prohealth-coverage-checker.vercel.app` (written as `SITE` below). The first request after a quiet period can take a few seconds while Neon wakes up.

**5.1 Health:** open `SITE/api/health`.
Expected: `{"ok":true,"db":"up"}`

**5.2 The page saves checks:**
1. Open `SITE/?ch=test&src=setup`.
2. Pick **Ruby**, type **mri**, press **Check**. Under the answer, tap **Yes** for "Was this answer helpful?"
3. Type **covid test** and press **Check**. The page should say it couldn't find this.

**5.3 The staff dashboard reads the database:**
1. Open `SITE/#insights`, enter the staff key, press **Open insights**.
2. The note should start with "Shared activity for the last 30 days".
3. The two checks from 5.2 appear under **Recent checks**, and **covid test** appears under **Questions the page couldn't answer**.
4. Press **Download CSV**. A file downloads.
5. Press **Sign out**.

**5.4 Staff data is locked:** open `SITE/api/insights` in a browser.
Expected: `{"error":"Staff key required"}`

**5.5 Personal data is scrubbed:** on the page, search **call me 08031234567**. In the dashboard, it shows as `call me [number]`.

The setup checks are stored with `channel = test`. In the dashboard, choose **Who: Enrollees** or **Call centre agents** to leave them out.

**Checklist**
- [ ] 5.1 to 5.5 all gave the expected result.

---

## Step 6: Report back to Daniel

```
Coverage Checker: Vercel + Neon setup complete

Site:                 https://prohealth-coverage-checker.vercel.app
Health check:         https://prohealth-coverage-checker.vercel.app/api/health -> {"ok":true,"db":"up"}
Repository:           github.com/<owner>/<repo> (branch <branch>)
Database:             Neon, prohealth-coverage-db, Frankfurt, Free plan
Deployment:           Ready at <time>

STAFF KEY (keep private; needed for /#insights):
<the key>

Tests 5.1 to 5.5:     passed / failed (details)

Links to share:
  Agents (pilot):     https://prohealth-coverage-checker.vercel.app/?ch=agent
  Enrollees by QR:    https://prohealth-coverage-checker.vercel.app/?src=qr
  Staff dashboard:    https://prohealth-coverage-checker.vercel.app/#insights

Old variables still in Vercel and no longer used (not deleted): <list or "none">
  (e.g. UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, KV_REST_API_URL, KV_REST_API_TOKEN)
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `/api/health` shows `{"ok":false,"db":"not configured"}` | `DATABASE_URL` missing, or no redeploy since connecting Neon | Check Step 2's checklist, then redeploy (Step 4) |
| `/api/health` shows `{"ok":false,"db":"down"}` | Wrong connection string, or Neon paused for exceeding free compute | In Storage, open the database and check its status; reconnect the project; redeploy |
| `/api/health` shows a Vercel 404 page | The `api/` folder wasn't uploaded, or sits inside a subfolder | Files must be at the repository root (Step 1 checklist) |
| Feedback (Yes/No) never saves | The `[id]` folder lost its brackets during upload | Make sure the path is exactly `api/checks/[id]/feedback.js` |
| Dashboard says "The database isn't connected yet" | Same as "not configured" above | Connect Neon and redeploy |
| Dashboard says "That key didn't work" | Key typed wrongly, or `STAFF_KEY` added without a redeploy | Copy it exactly from Vercel; redeploy |
| Build fails: `Cannot find module 'pg'` | `package.json` missing from the root | Upload `package.json` and `package-lock.json` to the root |
| `429 Too many requests` | Rate limit (60 per minute per visitor) | Wait a minute; this is expected |

---

## Limits to know

- **Neon Free:** 1 GB storage per project (years of checks at this volume), 100 compute hours a month, sleeps after 5 minutes idle and wakes on the next request. Its free limits don't delete data. ([Neon free plan limits](https://neon.com/faqs/free-plan-limits-and-quotas))
- **Vercel Hobby (free):** meant for personal, non-commercial use. Fine for the internal pilot; for go-live, move to ProHealth's own hosting or a paid Vercel plan.
- **Rate limiting** is per server instance. For stronger protection after go-live, add a rate-limit rule in Vercel → Firewall.
