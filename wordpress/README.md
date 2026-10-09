# BDS Marvel — WordPress Embed

Run the whole BDS Marvel (BDSM) React app inside a single WordPress page using a
shortcode. The React frontend keeps talking to the existing FastAPI + MongoDB
backend (bookings, auth, email), so nothing about the backend changes.

## How it works
- The app is built in **WordPress mode** (`REACT_APP_WORDPRESS_MODE=true`), which
  switches React Router to **HashRouter** — all in-app routes become
  `yourpage/#/stays`, `yourpage/#/projects`, etc. This means WordPress only needs
  **one** real page; no server rewrite rules required.
- A tiny WordPress plugin (`bds-marvel-app/`) enqueues the compiled JS/CSS and
  registers the `[bds_marvel_app]` shortcode, which renders the app's mount node
  `<div id="bdsm-marvel-root"></div>`.
- The build uses `INLINE_RUNTIME_CHUNK=false` so the webpack runtime is a real
  enqueueable file (otherwise it would be inlined into CRA's `index.html`, which
  the embed never serves).

## Build
From the repo root:

```bash
# Point the bundle at whatever backend the WP site should talk to:
REACT_APP_BACKEND_URL="https://api.yourdomain.com" ./scripts/build-wordpress.sh
```

This produces `frontend/build/` and copies it into
`wordpress/bds-marvel-app/build/`.

> The backend URL is **baked in at build time**. If you later move the API,
> re-run the build with the new `REACT_APP_BACKEND_URL`.

## Install in WordPress
1. Zip the plugin folder (it already contains `build/` after the step above):
   ```bash
   cd wordpress && zip -r bds-marvel-app.zip bds-marvel-app
   ```
2. In WP Admin → **Plugins → Add New → Upload Plugin** → choose `bds-marvel-app.zip` → Install → Activate.
3. Create/edit a page (ideally a blank/full-width template so the studio layout
   isn't boxed by the theme) and add the shortcode:
   ```
   [bds_marvel_app]
   ```
4. Publish and open the page. The full site (home, projects, catalogue, stays,
   contact, admin, etc.) runs inside that one page.

## Backend / CORS
The React app calls the FastAPI backend cross-origin. Add your WordPress site's
origin to the backend `CORS_ORIGINS` in `backend/.env`, e.g.:

```
CORS_ORIGINS="https://www.yourwpsite.com,https://1b725aca-....preview.emergentagent.com"
```

Then restart the backend. Auth uses cookies; for cross-site cookie auth the API
must be served over HTTPS and send `SameSite=None; Secure` cookies (already the
case in production preview).

## Notes / limits
- Deep links use the hash (`/#/stays/home/living-studio`). Sharing those URLs works.
- The theme's header/footer still render around the app. Use a blank page
  template for a true full-bleed experience.
- `manifest.json`/`favicon` from CRA are not used by the embed — WordPress owns
  the page `<head>`.
