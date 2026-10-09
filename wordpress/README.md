# BDS Marvel for WordPress — version 2

The BMM site's current React design now runs with a WordPress backend. No Emergent server, Python, MongoDB, or Node process is needed on the WordPress host. Node is only needed when changing and rebuilding the frontend source.

## Install

Use a self-hosted WordPress site or a WordPress plan that permits custom plugins and themes. PHP 7.4+ and WordPress 6.5+ are required; use a currently supported PHP release and HTTPS in production.

1. **Plugins → Add New → Upload Plugin**: upload `bds-marvel-app.zip`, install and activate it.
2. **Appearance → Themes → Add New → Upload Theme**: upload `bds-marvel-theme.zip`, install and activate it.
3. **Settings → Permalinks**: choose **Post name**, then save.
4. **Settings → Reading**: select **Your latest posts** for the homepage. The theme's `front-page.php` displays BDS Marvel there; this does not delete existing posts or pages.
5. **BDS Marvel** in the WordPress admin sidebar: set the notification email and whether new guests can register.
6. Open `/owner` and sign in using the email and password of a WordPress administrator. New guest accounts have the Subscriber role and cannot see owner records.
7. Configure your host's WordPress mail delivery or SMTP. Verify a real owner notification and a guest confirmation before accepting reservations.

Upload the two ZIPs separately: the plugin goes in Plugins, the theme goes in Themes. Do not upload the source ZIP as a theme.

The website is not automatically deployed by downloading or installing this package elsewhere. Install first on a staging site, then activate it on your intended WordPress site.

## What is preserved

The current home, six business sections, projects, catalogue and individual products, contact dialogs, stays search and filters, maps, favourites, photo galleries, date selection, checkout, guest trips/account screens, and owner dashboard use the BMM frontend.

The companion theme keeps clean routes, including `/projects/...`, `/catalogue/...`, `/stays/home/...`, `/stays/book/...`, `/stays/trips/...`, and `/owner`. WordPress installed in a subdirectory receives the correct router base and asset URLs at runtime.

## What WordPress now handles

- Guest email/password registration and login through WordPress users; the plugin has its own expiring, HttpOnly same-site session cookie. Password changes invalidate those sessions.
- Booking requests and instant reservations in dedicated WordPress database tables. Price and capacity come from the server's listing catalogue, and confirmed date overlaps are checked under a per-listing database lock.
- Owner booking approvals, declines and cancellations; only users with the `manage_options` capability have owner access.
- Contact, consultation, sample, product and quote enquiries; records stay saved independently of the theme.
- Owner and guest notifications through `wp_mail()`.
- Consultation image/PDF attachments, stored privately in the WordPress database (5 MB maximum). Administrator downloads are available under **BDS Marvel → Recent enquiries**. They are not public Media Library URLs.
- Standard WordPress pages and posts use the theme's regular PHP templates. Add a Privacy Policy or other WordPress page with a slug outside the application's reserved routes.

## Alternative: use the plugin with another theme

Add `[bds_marvel_app]` to one blank, full-width WordPress page. The app uses hash routes, e.g. `/studio/#/stays`. Use one shortcode instance per page. The companion theme is recommended for the original full-screen layout; other themes can impose their own styles and headers. For shortcode mode, open the owner screen at `/studio/#/owner`.

## Editing and rebuilding

The design is a React application hosted by WordPress. Its sections are **not Gutenberg or Elementor widgets**. Existing content is in `frontend/src/App.js`, `catalogueGallery.js`, and `frontend/src/stays/`. Edit and rebuild those files to change business/project/product/stay content. The rebuild also regenerates `includes/stays.json`, so displayed nightly rates and server-side booking rates stay aligned.

```sh
npm ci --prefix wordpress/build-tools
node scripts/build-wordpress.mjs
```

The build writes the production assets into `wordpress/bds-marvel-app/build/`. Package `bds-marvel-app/` and `bds-marvel-theme/` as separate ZIPs with one top-level folder each. Plugin URLs and REST endpoints are injected by WordPress at runtime; no domain or Emergent preview API is baked into the build.

## Limits and migration

- Existing Emergent/MongoDB accounts, bookings, enquiries and uploaded files are **not imported**. WordPress starts with its own records; keep the old system available until any required data migration is finished. Existing guests need a new WordPress account.
- Google sign-in through Emergent is hidden in WordPress mode. Email/password sign-in and WordPress password reset are available. A WordPress social-login integration would need separate setup.
- No online payment is collected; the original pay-at-property checkout is preserved.
- Original listing photos, maps and Google Fonts still use external services. Listing facts, sample reviews and draft booking policies retain the original source data and need owner review before real bookings.
- The app's main pages render in JavaScript; this conversion does not add PHP server rendering or page-by-page WordPress SEO editing for the React sections.
- Exclude app pages and `/wp-json/bds/v1/*` from full-page/CDN caches. API responses use `Cache-Control: no-store, private`. Do not cache authenticated account or trip views.
- Existing WordPress pages whose slugs match reserved application routes are served by the app while this theme is active.

## Verification

See `VERIFICATION.md` for the checks performed. Production-host installation, real email delivery, legacy data migration and a live payment gateway are outside the local validation.
