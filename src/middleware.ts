import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

// Any path with a file extension (favicon.ico, logo.svg, icon-192.png, …) —
// always public, regardless of auth state.
const PUBLIC_FILE = /\.[^/]+$/;

// Paths that must stay reachable even when auth is enforced, so the login
// page itself (and the endpoints it depends on) can render and be used.
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/setup",
  "/api/auth/setup-status",
  "/api/health",
  "/forgot-password",
  "/api/auth/forgot-password",
  "/reset-password",
  "/api/auth/reset-password",
]);

// Reachable even while a forced password change is pending — the page that
// does the changing, and logout (so someone can bail out to a different
// account instead of being stuck).
const PASSWORD_CHANGE_PATHS = new Set(["/change-password", "/api/auth/change-password", "/api/auth/logout"]);

// A client could otherwise set these directly on the incoming request and
// have a downstream route trust them as if middleware had verified them.
function stripIdentityHeaders(req: NextRequest): Headers {
  const headers = new Headers(req.headers);
  headers.delete("x-user-id");
  headers.delete("x-user-username");
  headers.delete("x-user-role");
  headers.delete("x-user-sv");
  return headers;
}

// ── Local mode (no AUTH_SESSION_SECRET: dev, and the desktop app's own server) ──────────────────────
// There's no login, so without these checks any website open in the user's browser could POST to
// http://127.0.0.1:3456/api/wipe (a blind "no-cors" request needs no response), and a DNS-rebinding page
// could read the data back. So: only answer when addressed as localhost (defeats rebinding — the attacker's
// page would arrive with its own hostname), and refuse state-changing requests that come from another site.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function localModeGuard(req: NextRequest): NextResponse | null {
  const host = req.headers.get("host") ?? "";
  // ALLOW_NO_AUTH=1 = the operator deliberately runs an open server reached by LAN address; only the
  // cross-site check below applies then.
  if (process.env.ALLOW_NO_AUTH !== "1" && !LOCAL_HOST.test(host)) {
    return NextResponse.json(
      { error: "This Upshift Garage has no login, so it only answers on localhost. Set AUTH_SESSION_SECRET to serve it to other devices." },
      { status: 403 }
    );
  }
  if (!SAFE_METHODS.has(req.method.toUpperCase())) {
    const site = req.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") {
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
    }
    const origin = req.headers.get("origin");
    if (origin && origin !== `http://${host}` && origin !== `https://${host}`) {
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
    }
  }
  return null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!process.env.AUTH_SESSION_SECRET) {
    const blocked = localModeGuard(req);
    if (blocked) return blocked;
  }

  // Static-asset exemption must never cover API routes — a dynamic segment like
// /api/foo/x.png would otherwise skip authentication.
if ((!pathname.startsWith("/api/") && PUBLIC_FILE.test(pathname)) || PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next({ request: { headers: stripIdentityHeaders(req) } });
  }

  // Auth is entirely inert unless a Docker/server deployment has set
  // AUTH_SESSION_SECRET — local dev and the Electron app's local
  // (non-Connected) mode never see it, and the Electron window loading its
  // own spawned local server always counts as local below anyway. Whether an
  // admin account already exists yet (bootstrapped via ADMIN_PASSWORD_HASH,
  // or nobody yet — see /api/auth/setup) doesn't change this check.
  if (!process.env.AUTH_SESSION_SECRET) {
    return NextResponse.next({ request: { headers: stripIdentityHeaders(req) } });
  }

  // NOTE: there is deliberately no "loopback bypass" here. It used to trust
  // X-Forwarded-For / an empty request.ip, both of which a remote client
  // controls, so it was a full authentication bypass. Electron's local mode
  // never sets AUTH_SESSION_SECRET (so auth is off there anyway), and its
  // "Connect to Server" mode signs in like any other client.

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const claims = token ? await verifySessionToken(token) : null;

  if (!claims) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // An admin-created account (temp password, emailed) must set its own
  // password before doing anything else.
  if (claims.mustChangePassword && !PASSWORD_CHANGE_PATHS.has(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Password change required" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  // Forward identity to downstream routes as headers — API routes (e.g. the
  // admin user-management endpoints) trust these instead of re-verifying the
  // JWT or querying Prisma again, since middleware already did that work.
  const headers = stripIdentityHeaders(req);
  headers.set("x-user-id", claims.userId);
  headers.set("x-user-username", claims.username);
  headers.set("x-user-role", claims.role);
  headers.set("x-user-sv", String(claims.sv));
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
