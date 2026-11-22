import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { isAuthEnabled } from "@/lib/auth/password";
import { createBackup } from "@/lib/backup";
import { isNewer } from "@/lib/version";
import pkg from "../../../../../package.json";

export const dynamic = "force-dynamic";

// "Update server" — admin-only, Docker/server mode only.
//
// The app container never touches the Docker socket. Instead it asks the Watchtower sidecar (see
// docker-compose.yml) to pull the newest image and recreate the container, using Watchtower's HTTP
// API on the private compose network (WATCHTOWER_URL + UPDATE_TOKEN, both set by the compose file).
// Watchtower is the only thing with socket access, and it's unreachable from outside the compose network.

const IMAGE = "ghcr.io/anthonykphoto/buildverse";
const RELEASES_URL = "https://api.github.com/repos/AnthonyKPhoto/Upshift-Garage/releases/latest";

let cache: { at: number; latest: string | null; url: string | null } | null = null;

async function latestRelease(): Promise<{ latest: string | null; url: string | null }> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache;
  try {
    const res = await fetch(RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "upshift-garage-update-check" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const j = (await res.json()) as { tag_name?: string; html_url?: string };
      const v = String(j.tag_name ?? "").replace(/^v/, "");
      cache = { at: Date.now(), latest: /^\d+\.\d+\.\d+$/.test(v) ? v : null, url: typeof j.html_url === "string" ? j.html_url : null };
      return cache;
    }
  } catch { /* offline / rate-limited — fall through */ }
  return { latest: cache?.latest ?? null, url: cache?.url ?? null };
}

function updaterConfig() {
  const url = process.env.WATCHTOWER_URL?.trim().replace(/\/+$/, "");
  const token = process.env.UPDATE_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

// GET → { current, latest, updateAvailable, releaseUrl, canUpdate }
export async function GET(req: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.json({ error: "Only available on a server" }, { status: 404 });
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { latest, url } = await latestRelease();
  return NextResponse.json({
    current: pkg.version,
    latest,
    updateAvailable: !!latest && isNewer(latest, pkg.version),
    releaseUrl: url,
    canUpdate: !!updaterConfig(),
  });
}

// POST → backs up the database, then tells Watchtower to update. Returns 202 straight away: the container is
// replaced a few seconds later, so there is no response to wait for. The page polls /api/health to see it come back.
export async function POST(req: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.json({ error: "Only available on a server" }, { status: 404 });
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const cfg = updaterConfig();
  if (!cfg) return NextResponse.json({ error: "Remote update isn't set up on this server (see Settings → Access & Sync → Server updates)." }, { status: 409 });

  try { await createBackup("before-update"); } catch (e) { console.error("[update] safety backup failed:", e); }

  // Fire and forget — Watchtower's call only returns after the update finished, and it kills this process.
  fetch(`${cfg.url}/v1/update?image=${encodeURIComponent(IMAGE)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}` },
    signal: AbortSignal.timeout(10 * 60_000),
  }).catch((e) => console.error("[update] updater call ended:", e instanceof Error ? e.message : e));

  return NextResponse.json({ started: true, from: pkg.version }, { status: 202 });
}
