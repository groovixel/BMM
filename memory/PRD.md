# PRD — BDS Marvel (BDSM) · Faithful GitHub Import (Re-import 2026-06)

## Original Problem Statement
Import `github.com/groovixel/BDSMM` (branch `main`, 38 commits) as a React + FastAPI + MongoDB
project. Keep app code 1:1 / as-is (no feature changes). Harden secret handling (no secrets in
source, `.env` only). Treat all screenshot secrets as compromised; generate FRESH JWT_SECRET +
ADMIN_PASSWORD; use rotated/platform-provisioned EMERGENT_* keys. Fresh empty MongoDB. Seed admin.
Run & verify in preview only (no live publish).

## Architecture
- **Frontend**: React 19 + CRACO (Yarn), Tailwind, Lenis smooth scroll, React Router. Editorial/
  marketing site for an architecture / marble & stone / flooring / construction / interiors studio
  ("BDS Marvel"). Owner/admin dashboard (`src/owner`) + "stays" booking area (`src/stays`). Entry
  `frontend/src/App.js`.
- **Backend**: FastAPI (`backend/server.py`), Motor (async MongoDB). All routes `/api`.
- **Database**: MongoDB, fresh DB `bdsm_database` (`MONGO_URL` + `DB_NAME`).
- **Auth**: JWT email/password (httpOnly cookies) + admin/owner roles. Admin seeded on startup from
  `ADMIN_EMAIL`/`ADMIN_PASSWORD`. New-device admin email alert.
- **Email**: Emergent-managed Resend (`send_email` + `_assert_safe_email` guardrail). Contact/
  inquiry/booking submissions notify `OWNER_EMAIL`.

## Import Done (2026-06)
- Cloned `main` (38 commits), synced source into `/app` (frontend/, backend/, tests/, docs).
- `backend/.env` created fresh: MONGO_URL, DB_NAME=`bdsm_database`, CORS_ORIGINS=preview URL,
  JWT_SECRET (fresh 256-bit), ADMIN_EMAIL=`info@bdsmarvel.com`, ADMIN_PASSWORD (fresh strong),
  OWNER_EMAIL=`info@bdsmarvel.com`, EMAIL_FROM_NAME=`BDS Marvel`, EMERGENT_EMAIL_KEY (platform),
  EMERGENT_LLM_KEY (universal).
- `backend/.env.example` + `frontend/.env.example` created (placeholders only).
- `frontend/.env` preserved (REACT_APP_BACKEND_URL). Frozen lockfile was stale → clean yarn install.
- Verified: `GET /api/` OK; admin login OK; wrong password → 401; `/api/auth/me` OK; fresh DB has 1
  admin user; new-device admin email sent (HTTP 202); no secrets in frontend source/bundle; `.env`
  gitignored; git history clean (no secrets ever committed).

## Security Notes
- Screenshot secrets treated as compromised/discarded. JWT_SECRET + ADMIN_PASSWORD freshly minted.
- EMERGENT_EMAIL_KEY / EMERGENT_LLM_KEY are platform-provisioned (fresh), not the old values.
- Only `REACT_APP_BACKEND_URL` + `REACT_APP_WORDPRESS_MODE` reach the browser (both public-safe).
- Git history scan: NO `.env` and NO secret strings were ever committed → nothing to scrub in-repo.

## Core Requirements (static)
- Faithful import — no app source edits.
- No secrets in source; `.env` only; `.env` gitignored.
- App runs in preview: frontend + backend + Mongo. Admin login works. Stop at preview.

## WordPress Embed (2026-06)
- Goal: run the whole React app inside one WordPress page (HashRouter embed). FastAPI/Mongo backend unchanged.
- Fixed dormant switch: `App()` JSX now uses env-driven `Router` (was hardcoded `<BrowserRouter>`). `REACT_APP_WORDPRESS_MODE=true` → HashRouter; unset (preview) → BrowserRouter.
- `index.js` mounts into `#bdsm-marvel-root` (fallback `#root`).
- Build: `scripts/build-wordpress.sh` (sets `REACT_APP_WORDPRESS_MODE=true`, `INLINE_RUNTIME_CHUNK=false`, bakes `REACT_APP_BACKEND_URL`).
- Plugin: `wordpress/bds-marvel-app/` — `bds-marvel-app.php` reads CRA `asset-manifest.json` entrypoints, enqueues JS/CSS, registers `[bds_marvel_app]` shortcode. Build copied into plugin `build/`.
- Docs: `wordpress/README.md` (build + install + CORS steps). For a real WP domain, add it to backend `CORS_ORIGINS` and rebuild with the deployed backend URL.
- NOT click-through tested inside a live WordPress instance (none available here); bundle compiles clean, is self-contained, env baked, switch wired.

## Backlog / Open
- P1: If user wants to point at their own MongoDB, swap MONGO_URL/DB_NAME and re-seed.
- P2: Live publish/deploy (currently preview-only per user choice).
