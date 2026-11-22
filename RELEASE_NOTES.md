## Upshift Garage v1.18.1

Fixes for Docker servers: the container no longer shows "unhealthy", the Docker image keeps publishing under its original name after the repo rename, and the bundled Watchtower works with current Docker engines. Includes everything in 1.18.0 (below).

## v1.18.0

### ✨ New
- **Update your server from the browser** — *Settings → Access & Sync → Server updates* (admins, Docker servers) shows the version you're running and the latest release, and has an **Update now** button. It backs up the database, pulls the new image, restarts, and reloads the page on the new version. The app never gets access to Docker itself — it just asks the Watchtower container that's already in `docker-compose.yml`.

### ⚙️ One-time setup for existing servers
1. Add `UPDATE_TOKEN=<a long random string>` to the `.env` next to `docker-compose.yml` (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
2. Pull the new `docker-compose.yml` from the repo, then `docker compose pull && docker compose up -d`.

After that, future updates are one click. Without `UPDATE_TOKEN` everything works as before and the page just shows these instructions.

### Upgrading
- **Docker:** `docker compose pull && docker compose up -d` (Watchtower will also pick it up). **Windows / Linux** auto-update. **macOS:** `brew upgrade --cask upshift-garage`.
