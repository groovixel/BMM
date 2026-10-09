# BDSM · BDS Marvel

React + FastAPI + MongoDB editorial site.

## Setup

1. Backend: copy `backend/.env.example` → `backend/.env` and fill in real values.
2. Frontend: copy `frontend/.env.example` → `frontend/.env` and fill in real values.
3. Install deps: `cd frontend && yarn install --frozen-lockfile`.
4. Run: backend via supervisor (`sudo supervisorctl restart backend`), frontend via `yarn start`.

## Security — Secrets & Environment Variables

- All secrets (MongoDB URL, `EMERGENT_EMAIL_KEY`, owner email, etc.) live in `.env`
  files, which are gitignored and never committed. No secret is hardcoded in source.
- Frontend only exposes `REACT_APP_`-prefixed values, all of which are public-safe
  (just the backend URL). Never put a key/secret/token behind a `REACT_APP_` prefix —
  CRA ships those to the browser.
- The email API key (`EMERGENT_EMAIL_KEY`) is read server-side only and never sent to
  the frontend or logged.

### ⚠️ Rotate previously hardcoded secrets

If any secret was ever hardcoded in a past commit, the old value still exists in git
history even after being moved to `.env`. **Treat any such value as compromised and
rotate it immediately** (regenerate the key/password at its provider, update `.env`).
Removing a secret from the current code does NOT remove it from history.
