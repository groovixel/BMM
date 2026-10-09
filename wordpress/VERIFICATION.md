# WordPress conversion verification

Source: groovixel/BMM main at `00031f4adfdd877fe924c81030c9adb3a398f3bf`.
Validation date: 9 October 2026.

## Passed locally

- Production build: bundled the current React frontend and Tailwind stylesheet; generated all 15 server-side stay records and copied the 24 client logos.
- Installed and activated the companion plugin and theme in WordPress Playground (WordPress 7.1.3; PHP runtime reports 8.5.10), with a disposable SQLite database.
- **48 API and route assertions**, repeated after session-invalidation changes: registration, persistent sessions, valid/invalid login, owner authorization, CSRF header/origin rejection, date validation, capacity enforcement, authoritative pricing, instant booking, duplicate date rejection, own-trip history/detail, other-guest denial, public availability privacy, pending requests, owner approval, approval conflict, cancellation, all five enquiry forms, invalid email rejection, owner counts, private-file access denial, plain-permalink REST URLs, nine clean routes, logout revocation, private image upload, unauthorized download denial, owner download byte equality, and executable upload rejection.
- Chrome desktop visual smoke checks through Computer: homepage and direct stay-detail route render, photos load, the calendar displays, and reservation controls appear. The stay page also renders in Chrome’s iPhone 16 emulation at 393 × 852, with mobile search and the Reserve control.
- Build manifest points to actual shipped files; ZIPs contain one correct top-level plugin/theme folder.

The test fixture intercepts WordPress mail; no messages are delivered externally during testing.

## Reproduce the API tests

Install WordPress Playground CLI in a temporary tooling directory, then from the repository root run:

```sh
npx @wp-playground/cli server --port=9401 --workers=1 \
  --mount="$PWD/wordpress/bds-marvel-app:/wordpress/wp-content/plugins/bds-marvel-app" \
  --mount="$PWD/wordpress/bds-marvel-theme:/wordpress/wp-content/themes/bds-marvel-theme" \
  --blueprint="$PWD/wordpress/tests/blueprint.json"
```

In a second terminal:

```sh
python3 wordpress/tests/test_api.py
```

The fixture creates a disposable test administrator and intercepts mail. Do not apply it to a real site. The test only accepts a localhost/127.0.0.1 URL and writes a JSON results file alongside itself.

## Validation limits

- MySQL hosting, HTTPS/proxy configuration, real SMTP delivery and host cache behavior require staging validation.
- No legacy Emergent database records are migrated.
- Real payment collection and Google social login are not implemented in this WordPress version.
- External image/map/font availability is outside the package.
- Local build tooling retains Tailwind 3's transitive `braces` advisory (no patched 3.x release available in the registry checked); it processes repository-owned source only and is not deployed to the WordPress server. PostCSS and its selector parser were updated separately.
