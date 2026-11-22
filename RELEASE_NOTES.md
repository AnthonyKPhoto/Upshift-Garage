## Upshift Garage v1.20.2

### 🐛 Fixes (frosted themes)
- The **More** menu on a vehicle page (Journal, Links, Files, Dyno, Logs): highlights stay inside the menu's rounded corners, the menu is easier to read, and the hover highlight is visible in Light Frosted too.
- The new **S · M · L** photo-size switch now matches the glass look of the controls next to it.

## v1.20.1

### 🐛 Fixes
- In the frosted themes, the **More** menu on a vehicle page (Journal, Links, Files, Dyno, Logs) no longer shows its highlight boxes sticking out past the menu. The same fix stops menu rows and plain buttons elsewhere from showing a permanent tinted box — they now only highlight when you hover them.

## v1.20.0

### ✨ New
- **Small / Medium / Large product photos on your mods** — on a vehicle's Mods tab, use the new **S · M · L** switch next to the view button. Works in every view (list, compact, kanban, timeline, gallery) and is remembered on that browser. Click any mod photo to see it full size.

Also includes the 1.19.0 security update (below).

## v1.19.0 — security update

This release fixes the issues found in an external security review. **Please update.**

### 🔒 Security
- **Desktop app / local mode:** a website you visit can no longer send requests to the app's local server (it could previously trigger actions such as "wipe" in the background). The desktop app also checks which page sends each sensitive request and now runs sandboxed.
- **Sessions can be revoked:** changing your password signs out your other devices, and *Settings → Account* has a new **Sign out everywhere** button. Role changes also end that user's sessions.
- **Changing your password now asks for your current one.**
- **Full data export (transfer pack) is admin-only** on servers.
- **Fresh servers:** creating the first admin needs a one-time setup code from the server log (`docker logs buildverse`), and the container won't start without `AUTH_SESSION_SECRET` — so a server can't end up open by accident.
- Tighter sign-in rate limiting, zip-import limits, file-path checks, a stricter link-scraper filter (IPv6), and new security headers.

### 🐛 Fixes
- Downloaded files keep their real names (no more `Brake%20pads.pdf`).
- The welcome screen no longer shows through to the dashboard in the frosted themes, and it no longer appears when you sign in on a new browser to a garage that already has cars.

### Upgrading
- **Docker:** use *Settings → Access & Sync → Server updates → Update now*, or `docker compose pull && docker compose up -d`. Your `.env` must contain `AUTH_SESSION_SECRET` (it already does if you can sign in today). Behind a reverse proxy or Cloudflare Tunnel, optionally add `TRUST_PROXY_HOPS=1` to `.env` for per-address sign-in limits.
- **Desktop:** Windows / Linux auto-update; macOS: `brew upgrade --cask upshift-garage`.
- Everyone signed in stays signed in.
