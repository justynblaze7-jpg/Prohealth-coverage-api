# Can I Use My Plan? (ProHealth HMO)

A phone-friendly page where enrollees pick their plan, type what they need, and get a plain answer: covered, covered with a limit, or not covered. Every check is logged anonymously so staff can see what enrollees ask, what the page can't answer, and which excluded benefits people want.

**Hosting:** one Vercel project (page + API functions) and a free Neon Postgres database. Setup steps: **[SETUP.md](SETUP.md)**.

## Endpoints

| Method | Path | Who | What |
| --- | --- | --- | --- |
| GET | `/api/health` | Anyone | `{"ok":true,"db":"up"}` when the database answers |
| POST | `/api/checks` | The page | Stores one check, returns `{ id }` |
| POST | `/api/checks/:id/feedback` | The page | `{"helpful": true}`; a second answer replaces the first (within 24 hours) |
| GET | `/api/insights?days=30&channel=enrollee` | Staff (`X-Staff-Key` header) | Summary, daily counts, top services, unanswered questions, not-covered requests, by plan, channel and source, latest 1,000 checks |
| GET | `/api/export.csv?days=30` | Staff (`X-Staff-Key` header) | Every field, for Excel |

`/api/log` is another name for `/api/checks`.

## What is stored

**`coverage_checks`:** time, the words typed (phone numbers, IDs and emails replaced with `[number]`, `[id]`, `[email]`), plan, benefit matched and its section, the answer (`ok` covered, `lim` with a limit, `no` not covered, `gap` not stated, `unk` not found), the limit text shown, how it was found (`search`, `suggestion`, `chip`), `channel` (`enrollee`, `agent`, `staff`, `test`), `source` (`qr`, `app`, `whatsapp`, ...), a random per-tab session id, device type, and the schedule year.

**`check_feedback`:** check id, helpful yes/no, optional comment, time.

No names, member numbers, phone numbers, emails or IP addresses are stored.

## Links to share

| Who | Link |
| --- | --- |
| Call centre agents (pilot) | `https://<site>/?ch=agent` |
| Enrollees from a QR code | `https://<site>/?src=qr` |
| Enrollees from the app | `https://<site>/?src=app` |
| Enrollees via WhatsApp | `https://<site>/?src=whatsapp` |
| Staff dashboard | `https://<site>/#insights` (needs the staff key) |

## Matching rules

- Filler words ("does", "my", "plan", "cover") are ignored.
- Words of 3 letters or fewer ("ct", "ent", "gym") must start a word.
- Questions about the plan itself (change hospital, card, premium, adding a spouse) are not guessed; they are logged as unanswered and the enrollee is told to call ProHealth.
- A word that appears nowhere in the schedule ("covid", "ivf") is logged as unanswered rather than matched to something close.

## Updating plan benefits

```bash
pip install openpyxl
python3 scripts/build_plans.py "PROHEALTH_PLANS_2027.xlsx"
```

Everyday words ("toothache" for Simple Extraction, "typhoid" for Widal) live in the `ALIAS` list in `scripts/build_plans.py`. Add to it when the dashboard shows common unanswered questions. Commit and push; Vercel redeploys.

## Tests

```bash
npm install
npm test
```

## Known gaps

- The schedule doesn't say which services need pre-authorisation or which hospital tier to use.
- Three cells are blank in the 2026 schedule and show as "Not stated": Gingival curettage (Emerald), Fertility investigation (Pearl), screening Urinalysis (Pearl, Diamond, Diamond Plus).
