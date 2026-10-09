# Import of groovixel/BDD

This brings the public GitHub repository https://github.com/groovixel/BDD (branch `main`) into this project as-is and gets it running.
The existing app (catalogue galleries, forms, admin login alerts, search) is kept exactly as written, with no changes to the code.

## Who it's for
The repository owner, who wants their existing app running in this workspace so they can keep working on it.

## Core features and experience
- The full repository contents (backend, frontend, memory notes, tests, test reports) are copied in and replace the starter template.
- Dependencies are installed and the backend and frontend are started.
- Environment files are set up from the repo's `.env.example` templates:
  - The database connection uses this workspace's existing database settings.
  - Secret values the repo needs (for example the email-sending key and the owner/admin email) are filled in with values the user provides.
- The app is checked to confirm it loads in the browser and the backend responds.

## User flow
1. The repo is imported and installed.
2. The user is asked for the exact secret values listed in the repo's `.env.example` files, and pastes them in.
3. The app is started and checked, and the preview link is shared.

## UI/UX feel
No change. The app looks and behaves exactly as it does in the repository.

## Implementation phases
- **Phase 1 (MVP, built now):** Import the repo, set up env files with the user's secrets, install, start, and confirm the app loads.
- **Phase 2:** Fix anything that blocks the app from running in this environment, only if the user asks.
- **Phase 3:** New features or changes the user requests.

## Assumptions
- Branch `main` is imported at its latest commit, including all folders (`.emergent`, `.screenshots`, `memory`, `tests`, `test_reports`).
- The starter template files are replaced by the repo's files.
- This workspace's existing database is used, starting empty. Data from any earlier deployment is not migrated.
- The build pauses to ask for secret values, because none were included in the request.
- If the app fails to start because of a problem in the code, it is reported and not fixed, in line with the "no code changes" choice.
