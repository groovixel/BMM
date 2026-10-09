# PRD — BDSM / BDS Marvel (Faithful Clone Import)

## Original Problem Statement
Import `https://github.com/groovixel/bdsm.git` (branch `main`) exactly as-is into the Emergent
stack (React + FastAPI + MongoDB), preserving full Git history, get it running reliably, and add
email. Faithful clone: source code unchanged; only setup/config/lockfile + email configuration.

## Architecture
- **Frontend**: React 19 + CRACO (Yarn 1), craco.config.js path aliases (`@/`), Tailwind, Lenis
  smooth scroll. Editorial/marketing site with scroll-reveal article slides. Entry `frontend/src/App.js`.
- **Backend**: FastAPI (`backend/server.py`), Motor (async MongoDB). Routes under `/api`.
- **Database**: MongoDB, fresh empty DB `bdsm_database` (via `MONGO_URL` + `DB_NAME`).
- **Email**: Emergent-managed Resend. Existing code in `server.py` (`send_email` + `_assert_safe_email`
  guardrail gate). Fires on contact-form submit → notifies `OWNER_EMAIL`.

## Import Done (2026-06)
- Cloned `main` with full commit history preserved — **109 commits** swapped into `/app/.git`.
- Folder structure verified: `frontend/`, `backend/`, `tests/`, repo metadata intact.
- `backend/.env` created: MONGO_URL, DB_NAME (fresh `bdsm_database`), CORS_ORIGINS,
  EMERGENT_EMAIL_KEY, EMAIL_FROM_NAME=`BDS Marvel`, OWNER_EMAIL (placeholder `delivered@resend.dev`).
- `frontend/.env` preserved (REACT_APP_BACKEND_URL).
- Run command: source already uses `craco start` (`yarn start`) — no `yarn dev` mismatch existed.
- `yarn.lock` already committed in repo; `yarn install --frozen-lockfile` succeeds (reproducible build).
- Smoke tests: `GET /api/` → Hello World; `POST /api/inquiries` → 201; `GET /api/inquiries` → Mongo OK.
- Committed backend test `tests/test_tscheck_contact.py` PASSES (needed `pytest-asyncio` plugin, absent
  from repo requirements — a source-level test-infra gap, not app breakage).
- Frontend loads: BDS Marvel editorial intro renders.

## Core Requirements (static)
- Faithful clone — no source edits.
- Full git history preserved.
- App runs: frontend + backend + Mongo.
- Email wired to contact-form touchpoint.

## Backlog / Remaining
- **P0**: Set real `OWNER_EMAIL` in `backend/.env` (currently placeholder `delivered@resend.dev`) so
  contact-form inquiries reach the real business inbox.
- **P2**: Add `pytest-asyncio` to `backend/requirements.txt` if committing the test-runner fix upstream.
- **P2**: Repo has no lint/typecheck/frontend tests (declared source-scope gap).

## Notes
- No auth in app (no test credentials needed).
- No payments/AI/storage integrations — none added (per source scope).
