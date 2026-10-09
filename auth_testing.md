# Auth Testing
- Admin: see /app/memory/test_credentials.md
- Login: POST /api/auth/login (cookies access_token/refresh_token), GET /api/auth/me, POST /api/auth/logout
- Mutating requests with an Origin header must come from the same host or CORS_ORIGINS, else 403.
- Backend pytest files read ADMIN_EMAIL/ADMIN_PASSWORD from env: `export $(grep ADMIN_ /app/backend/.env | xargs)`
