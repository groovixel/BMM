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

## Live forms verified on 9 October 2026

BDS Marvel App 2.0.1 is active at https://bdsmarvel.com. All five enquiry forms were submitted through Chrome and verified in WordPress and the owner dashboard. Contact, consultation (including PNG upload), product inquiry, collection quote/sample and individual product quote passed. Owner attachment download matched the original bytes; anonymous download returned 403.

Live guest registration, cookie session, logout, wrong-password rejection, login, instant booking, own-trip retrieval, duplicate-date rejection and owner authorization passed. A booking request was submitted through checkout, approved by the owner and cancelled. The instant test booking was also cancelled; zero pending/upcoming QA stays remain. The owner confirmed email receipt.

Required-field validation was repaired in both React and PHP; a fresh local run passed 44 API/route checks plus 10 additional required-field/optional-address checks. The five enquiries, attachment and clearly named QA subscriber remain for audit.

## Validation limits

- Live submission, HTTPS session and email delivery were verified on WordPress.com; infrastructure and every mail provider were not independently audited.
- No legacy Emergent database records are migrated.
- Real payment collection and Google social login are not implemented in this WordPress version.
- External image/map/font availability is outside the package.
- Local build tooling retains Tailwind 3's transitive `braces` advisory (no patched 3.x release available in the registry checked); it processes repository-owned source only and is not deployed to the WordPress server. PostCSS and its selector parser were updated separately.

## WordPress content editor 3.0.0

The production build passed. The original 48 API/route checks passed with native content enabled. A separate disposable-local suite passed 19 CMS assertions: authenticated editor access; anonymous write denial; project create, edit, publish and draft behavior; stay price/capacity/gallery edits; authoritative checkout pricing/capacity; removal of all products from a collection; custom required form fields and saved values; disabled form rejection; seed idempotence; new shortcode forms and their submissions; hiding site sections without hardcoded fallback. Two additional targeted checks passed for mandatory form identity fields and correct display of WordPress title entities.

Chrome UI verification confirmed the native project editor saves its metadata, including ₹ and Unicode, and the project page displays the change. The Text & links editor saved a homepage headline replacement and the homepage displayed it. Test mail is intercepted on localhost. CMS test command: `BDS_TEST_URL=http://127.0.0.1:9405 python3 wordpress/tests/test_editable.py`. Use only the disposable local fixture.
