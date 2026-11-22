# Changelog

All notable changes to **Upshift Garage** (formerly BuildVerse). Full release notes, with downloads, are on the
[Releases page](../../releases). Versions follow [semantic versioning](https://semver.org).

## [1.19.0] — 2026-11-22

Fixes from an external security review (static review of v1.18.1; IDs refer to that report).

### Security
- **SEC-01** Local/desktop mode (no login): the server only answers requests addressed to localhost/127.0.0.1/[::1] (defeats DNS
  rebinding) and rejects state-changing requests that are cross-site (`Sec-Fetch-Site`) or carry a foreign `Origin` — a web page
  can no longer blind-POST to `127.0.0.1:3456/api/wipe`. `ALLOW_NO_AUTH=1` lifts only the host check.
- **SEC-02** `GET /api/export-zip` is admin-only (it was available to any signed-in member).
- **SEC-03** The Docker container refuses to start without `AUTH_SESSION_SECRET` unless `ALLOW_NO_AUTH=1`; secrets under 32 characters warn.
- **SEC-06** Sessions can be revoked: `User.sessionVersion` is carried in the token and checked against the database. Password change,
  password reset, role change and an admin-set password bump it; new **Sign out everywhere** button (Settings → Account).
- **SEC-07** Changing your password requires the current one (not for the forced first change of a temp password).
- **SEC-08** Login/reset rate limits: client address comes from `X-Forwarded-For` only with `TRUST_PROXY_HOPS` set (default 0); no more
  shared "unknown" bucket; per-username limits always apply.
- **SEC-09** Electron: every IPC handler checks the sending frame's origin; backup/transfer channels are local-only; `prefs:set` takes only
  known keys; the window runs with `sandbox: true`.
- **SEC-10** Zip import: Content-Length checked before the body is read (512 MB cap), one import at a time, zip-bomb checks (total size, ratio).
- **SEC-12** First-run setup needs a one-time code printed to the server log.
- **SEC-13** File/tune-log paths go through `safeJoin()` and can't leave the files folder.
- **SEC-14** Changing the LubeLogger URL clears the stored credentials.
- **SEC-16** "Refresh all" products has a 5-minute cooldown.
- **SEC-17** Content-Security-Policy added in report-only mode.
- **SEC-18** `COOKIE_SECURE=false` for plain-http LAN installs; all session cookies come from one helper.
- **SEC-19** Scraper SSRF guard resolves IPv4 and IPv6 and blocks NAT64, 6to4, Teredo, benchmark/test ranges via `net.BlockList`.
- Dependencies: zod 4, nodemailer 10; `uuid` removed (`crypto.randomUUID`).

### Fixed
- **BUG-01** Downloads keep their real file name (RFC 5987 `filename*`).
- **BUG-02** Changing the password of a deleted account returns 401, not 500.
- The first-run welcome wizard showed through to the dashboard in the frosted themes; full-screen overlays now get a frosted backdrop.
  The wizard also no longer appears for a garage that already has vehicles (e.g. signing in on a new browser).

### Not in this release
- **SEC-04 / SEC-05** Next.js 14 → 15/16 and Electron 33 → current are a separate upgrade (breaking changes across all routes).
- SEC-11 (Android build hardening) and SEC-15 (encrypting stored SMTP/LubeLogger secrets).

## [1.18.1] — 2026-11-22

### Fixed
- Docker: the container always reported **unhealthy** — Next's standalone server binds `$HOSTNAME` (the container id under Docker), so the in-container healthcheck on 127.0.0.1 was refused. The image now sets `HOSTNAME=0.0.0.0` (and the compose file does too, for older images).
- Docker publishing: the image is pinned to `ghcr.io/anthonykphoto/buildverse` so the GitHub repo rename can't move it.
- Compose: Watchtower crash-looped on current Docker engines ("client version 1.25 is too old") — `DOCKER_API_VERSION=1.44`.

## [1.18.0] — 2026-11-21

### Added
- **Update the Docker server from the browser** — Settings → Access & Sync → Server updates (admin, server mode): shows the running and latest version (`GET /api/admin/update`, from the GitHub releases API) and an **Update now** button (`POST /api/admin/update`) that takes a `before-update` backup and asks the Watchtower sidecar (`POST /v1/update`, private compose network, bearer `UPDATE_TOKEN`) to pull the image and recreate the container; the page waits for the new version and reloads. Turned on by `UPDATE_TOKEN` in `.env`.

### Changed
- `docker-compose.yml`: the app container has a fixed `container_name: buildverse` (so Watchtower's name filter matches), Watchtower runs with `--http-api-update --http-api-periodic-polls`, and both get the token. **Existing servers need one manual `docker compose pull && docker compose up -d` (plus `UPDATE_TOKEN` in `.env`) to enable the button.**

## [1.17.0] — 2026-11-20

### Changed
- Links, the cask and the auto-updater now point at the renamed GitHub repo (`AnthonyKPhoto/Upshift-Garage`; the old URL redirects).

### Added
- **Sale alerts** — the scraper now reads the shop's crossed-out "was" price (JSON-LD `ListPrice`/`StrikethroughPrice`, product meta tags, then a struck-through/compare-at element next to the current price) into `TrackedProduct.listPrice`. A product is "on sale" when that price is ≥3% (and ≥50¢) above the current one. New per-product `notifySale` switch (default on for newly tracked products); the email fires when a sale *starts* (background check sees it on after `saleSeen` was off) and re-arms when it ends. "On sale" badge, crossed-out price and filter on the tracker; badge on the mod card.
- **Alert emails say which car they're for** — each item lists `vehicle — mod` for every not-yet-bought mod whose link matches the product.

## [1.16.0] — 2026-11-13

### Added
- **Homebrew cask** (`Casks/upshift-garage.rb`, regenerated by the release workflow's `update-cask` job) — `brew install --cask upshift-garage`.
- Product Tracker: **Sync from Mods by car** (`POST /api/products/sync` takes `vehicleIds`; `GET` lists cars with link counts), **Delete all** (`DELETE /api/products`, admin), filter by car.
- **Auto-remove bought products** — the scheduled check (and Refresh all / Sync) deletes tracked products whose linked mods are all Purchased / Installed / Removed; setting `autoRemoveBought` (default on), removal log shown as a dismissible banner.

### Changed
- Mods that are Purchased / Installed / Removed are no longer imported or trackable (sync skips them; "Track this price" is hidden and the API rejects it).

### Fixed
- Stale browser favicon: icons are cache-busted (`?v=2`) and an SVG icon is declared.

## [1.15.0] — 2026-11-13

BuildVerse is now **Upshift Garage**.

### Added
- **Product Tracker rebuild** — new layout (stat cards, filters, sort, sparklines), background price checks, optional email alerts
  (target reached, big drops, back in stock) sent as one digest, bulk alerts dialog, and price data read from schema.org/JSON-LD.
- **Shop comparison** — group the same part across shops; cheapest in-stock option is highlighted.
- **Mod ⇄ tracker links** — URL-normalized matching, one-click "Track this price", "use this price" on the mod, and linked mods on tracker cards.
- **Scheduled backups** — consistent snapshots (SQLite `VACUUM INTO`), configurable interval and retention, download / delete / restore (server mode).
- **Frosted-glass appearance** — Light Frosted, Dark Frosted and Clear Crystal materials with a floating switcher; custom background picture;
  sliders for glass opacity, blur, saturation, edge shine, shadow and corner roundness. Classic remains the default.
- Appearance options: custom accent colour, interface size, sidebar width, reduce motion, currency, show cents, date format.
- **macOS** desktop builds (Apple Silicon and Intel).
- New logo and generated icon set for the web app, Windows, macOS, Linux and Android.
- Docker: pre-update database copy on every boot; `APP_URL` setting; OCI image labels.
- Repository: SECURITY policy, issue and pull-request templates, screenshots, social-preview image.

### Security
- Fixed a sign-in bypass in server mode and tightened authorization for admin-only and cross-vehicle actions; roles are re-verified
  against the database; sessions shortened to 7 days.
- Hardened password-reset/welcome email links, file serving and upload limits, zip import/restore, product scraping (redirect and
  IP-literal handling, response size cap), image proxy removal, security headers, and desktop external-link handling.
- Stopped sending stored integration credentials to caller-supplied URLs; only `http(s)` links are accepted.
- Updated Next.js to 14.2.35 and applied non-breaking dependency fixes.
- `docker-compose.yml` now binds to `127.0.0.1` by default.

### Fixed
- "Refresh all" overwrote each product's all-time lowest price.
- A failed price check replaced a good price/title with a placeholder.
- "Out of stock" was styled like "in stock"; product prices were rounded to whole dollars.
- Desktop transfer-pack export/import relied on Windows-only PowerShell (now works on macOS and Linux).
- Desktop icons were never committed, so installers and the tray had no icon source.

### Changed
- Product renamed from BuildVerse to **Upshift Garage**. The desktop data folder (`…/BuildVerse`), database file names, repository,
  and Docker image path are intentionally unchanged so existing installs keep working.
