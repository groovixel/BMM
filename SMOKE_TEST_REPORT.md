# BDS Marvel — Import & Smoke-Test Status Report
Date: 2026-06-06 (session) · Repo: groovixel/BDSMarve @ main (commit 8b236e9)

## Services — RUNNING
- backend (uvicorn, 0.0.0.0:8001) — RUNNING
- frontend (craco/yarn, 0.0.0.0:3000) — RUNNING
- mongodb — RUNNING

## Config
- backend/.env: MONGO_URL, DB_NAME, CORS_ORIGINS, EMERGENT_EMAIL_KEY (user-provided), EMAIL_FROM_NAME="BDS Marvel", EMAIL_REPLY_TO=info@bdsmarvel.com, OWNER_EMAIL=info@bdsmarvel.com
- frontend/.env: REACT_APP_BACKEND_URL only (public-safe)
- Deps: `pip install -r backend/requirements.txt` OK; `yarn install` OK (no yarn.lock in repo — plain install, fresh lockfile generated)

## Smoke-test results
| Check | Result |
|---|---|
| GET /api (health) | PASS — {"message":"Hello World"} |
| POST /api/status → Mongo write | PASS |
| GET /api/status → Mongo read | PASS |
| Route / (home) | PASS |
| Route /projects | PASS |
| Route /catalogue | PASS |
| Route /catalogue/:slug (center-end-tables) | PASS |
| Route /stays | PASS |
| Route /contact | PASS |
| POST /api/inquiries (contact/project inquiry) | PASS — persisted |
| POST /api/consultations | PASS — persisted |
| POST /api/sample-requests | PASS — persisted |
| POST /api/product-inquiries | PASS — persisted |
| POST /api/bookings (stay booking) | PASS — persisted |
| POST /api/bookings/{id}/status (confirm) | PASS — status=confirmed |
| Overlapping dates blocked | PASS — 409 "Those nights are already booked" |
| Non-overlapping booking | PASS — 201 |
| GET /api/stays/availability?stay=... | PASS — {booked:1, requested:1} |

## Known issues (flagged, NOT fixed)
1. **Email notifications broken** — proxy rejects the key: HTTP 401 `{"error":"invalid X-Email-Key"}`. Submissions save to Mongo; owner emails are NOT delivered. The user-supplied key was also rejected.
2. **No owner/admin UI** — bookings confirmed/cancelled via raw API; the 5 submission collections have no dashboard.
3. **Placeholder content** — catalogue/projects/stays use Unsplash imagery and sample listings.
4. **Secrets hygiene** — any previously hardcoded secret still lives in git history; rotate at provider if that ever happened.

## Suggested next session (priority order)
1. Fix email delivery (valid email key) → real owner inbox
2. Password-gated owner dashboard: submissions + booking confirm/cancel
3. Real content + production deploy
