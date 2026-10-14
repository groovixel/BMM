# BDS Marvel for WordPress — version 3

The BMM site's current React design now runs with a WordPress backend. No Emergent server, Python, MongoDB, or Node process is needed on the WordPress host. Node is only needed when changing and rebuilding the frontend source.

## Install

Use a self-hosted WordPress site or a WordPress plan that permits custom plugins and themes. PHP 7.4+ and WordPress 6.5+ are required; use a currently supported PHP release and HTTPS in production.

1. **Plugins → Add New → Upload Plugin**: upload `bds-marvel-app.zip`, install and activate it.
2. **Appearance → Themes → Add New → Upload Theme**: upload `bds-marvel-theme.zip`, install and activate it.
3. **Settings → Permalinks**: choose **Post name**, then save.
4. **Settings → Reading**: select **Your latest posts** for the homepage. The theme's `front-page.php` displays BDS Marvel there; this does not delete existing posts or pages.
5. **BDS Marvel** in the WordPress admin sidebar: set the notification email and whether new guests can register. Razorpay keys are optional; add them to enable online payment. Without keys, guests can still submit unpaid booking requests for host approval.
6. Open `/owner` and sign in using the email and password of a WordPress administrator. New guest accounts have the Subscriber role and cannot see owner records.
7. Configure your host's WordPress mail delivery or SMTP. Verify a real owner notification and a guest confirmation before accepting reservations.

Upload the two ZIPs separately: the plugin goes in Plugins, the theme goes in Themes. Do not upload the source ZIP as a theme.

The website is not automatically deployed by downloading or installing this package elsewhere. Install first on a staging site, then activate it on your intended WordPress site.

## What is preserved

The current home, six business sections, projects, catalogue and individual products, contact dialogs, stays search and filters, maps, favourites, photo galleries, date selection, checkout, guest trips/account screens, and owner dashboard use the BMM frontend.

The companion theme keeps clean routes, including `/projects/...`, `/catalogue/...`, `/stays/home/...`, `/stays/book/...`, `/stays/trips/...`, and `/owner`. WordPress installed in a subdirectory receives the correct router base and asset URLs at runtime.

## What WordPress now handles

- Guest email/password registration and login through WordPress users; the plugin has its own expiring, HttpOnly same-site session cookie. Password changes invalidate those sessions.
- Booking requests and paid reservations use dedicated WordPress database tables. The server calculates price and checks capacity from the listing record, and protects availability checks and writes with a per-stay lock. When Razorpay keys are configured, payment is verified server-side. Without keys, checkout still submits an unpaid request for host approval; it never treats an unpaid request as confirmed.
- Owner booking approvals, declines and cancellations; only users with the `manage_options` capability have owner access.
- Contact, consultation, sample, product and quote enquiries; records stay saved independently of the theme.
- A separate standalone Sales Workspace is built from `standalone-sales/`. It uses browser-local storage and has no WordPress or public-site integration.
- Owner and guest notifications through `wp_mail()`.
- Consultation image/PDF attachments, stored privately in the WordPress database (5 MB maximum). Administrator downloads are available under **BDS Marvel → Recent enquiries**. They are not public Media Library URLs.
- Standard WordPress pages and posts use the theme's regular PHP templates. Add a Privacy Policy or other WordPress page with a slug outside the application's reserved routes.

## Alternative: use the plugin with another theme

Add `[bds_marvel_app]` to one blank, full-width WordPress page. The app uses hash routes, e.g. `/studio/#/stays`. Use one shortcode instance per page. The companion theme is recommended for the original full-screen layout; other themes can impose their own styles and headers. For shortcode mode, open the owner screen at `/studio/#/owner`.

## Editing and rebuilding

Use **BDS Marvel** in the WordPress admin sidebar. Projects, Catalogue, Airbnb stays, Services, Clients, Site sections and Forms are native WordPress records. Edit their title and Website content fields, then Update. Add New creates an entry; Draft or Trash hides it from the public website. Published content loads from the WordPress content API on every new page load.

Catalogue products live under each collection's **Detail → Products**. Edit photos using the Media Library, and add, remove or reorder products and gallery items. Stay prices, capacity and minimum nights are enforced by the booking API; existing bookings retain their original totals. Keep a stay's slug unchanged after it has bookings.

**Forms** controls field labels, types, options, required status, submit labels, success messages, notification email and enabled status. Name and email remain required. Add new forms to ordinary WordPress pages with `[bds_marvel_form slug="your-form-slug"]`. File upload is supported by the built-in consultation dialog. **Submissions** displays saved enquiries, including custom field values. **Bookings** opens booking management inside WordPress.

**Text & links** searches the remaining interface copy, phone numbers, email and URLs. A replacement applies wherever that exact text appears. **Site sections** contains homepage and about-page lists, the living-studio feature, stay tiers and booking policies.

The page layout remains the React design; these are content editors, not Gutenberg or Elementor layout widgets. Changing the underlying layout or frontend behavior requires editing and rebuilding the source. Ordinary content changes require no build. Initial content is seeded once; updates do not recreate trashed entries or overwrite edits. The seed snapshot is `includes/content-defaults.json`. The preparation script is a maintenance tool for updating source defaults, not a deployment step.

```sh
npm ci --prefix wordpress/build-tools
node scripts/build-wordpress.mjs
```

The build writes the production assets into `wordpress/bds-marvel-app/build/`. Package `bds-marvel-app/` and `bds-marvel-theme/` as separate ZIPs with one top-level folder each. Plugin URLs and REST endpoints are injected by WordPress at runtime; no domain or Emergent preview API is baked into the build.

## Limits and migration

- Existing Emergent/MongoDB accounts, bookings, enquiries and uploaded files are **not imported**. WordPress starts with its own records; keep the old system available until any required data migration is finished. Existing guests need a new WordPress account.
- Google sign-in through Emergent is hidden in WordPress mode. Email/password sign-in and WordPress password reset are available. A WordPress social-login integration would need separate setup.
- Razorpay credentials are configured under **BDS Marvel** settings. If they are absent, booking requests remain available without payment, and every stay waits for host approval.
- Original listing photos, maps and Google Fonts still use external services. Listing facts and draft booking policies need owner review before real bookings. Reviews can be managed in each stay record.
- The app's main pages render in JavaScript; this conversion does not add PHP server rendering or page-by-page WordPress SEO editing for the React sections.
- Exclude app pages and `/wp-json/bds/v1/*` from full-page/CDN caches. API responses use `Cache-Control: no-store, private`. Do not cache authenticated account or trip views.
- Existing WordPress pages whose slugs match reserved application routes are served by the app while this theme is active.

## Verification

See `VERIFICATION.md` for the checks performed. The live Razorpay checkout requires valid account keys; when keys are absent, the unpaid-request path is used. Live payment processing must be tested after configuring Razorpay credentials.
