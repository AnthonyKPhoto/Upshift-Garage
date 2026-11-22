import { NextRequest } from "next/server";

// Shared by the login/forgot-password/reset-password routes.

// Which client address to rate-limit on — or null when there's no address we can trust.
//
// X-Forwarded-For is client-controllable: each proxy APPENDS what it saw, so only the last N entries
// (N = proxies you run) are real. How many proxies sit in front is a deployment fact, so it's explicit:
// TRUST_PROXY_HOPS (default 0). With 0 the header is ignored entirely — reached directly, a client could
// otherwise rotate it to dodge the limiter. Returning null (rather than one shared "unknown" bucket) means
// callers skip the per-address limit instead of letting one attacker lock everybody out; the per-username
// limits still apply either way.
export function getClientKey(req: NextRequest): string | null {
  const hops = Math.max(0, Math.floor(Number(process.env.TRUST_PROXY_HOPS ?? "0")) || 0);
  if (hops === 0) return null;
  const parts = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length >= hops ? parts[parts.length - hops] : null;
}

export function createRateLimiter(maxAttempts: number, windowMs: number) {
  const attempts = new Map<string, { count: number; resetAt: number }>();
  return {
    isLimited(key: string): boolean {
      const entry = attempts.get(key);
      return !!entry && Date.now() < entry.resetAt && entry.count >= maxAttempts;
    },
    record(key: string) {
      const now = Date.now();
      // Opportunistic cleanup so the map can't grow without bound.
      if (attempts.size > 10_000) {
        attempts.forEach((v, k) => { if (now > v.resetAt) attempts.delete(k); });
      }
      const entry = attempts.get(key);
      if (!entry || now > entry.resetAt) {
        attempts.set(key, { count: 1, resetAt: now + windowMs });
      } else {
        entry.count += 1;
      }
    },
  };
}

/**
 * Origin to put in emailed links. Built from the request's Host header, an
 * attacker can poison it (Host: evil.com) so a reset email points at their
 * site. Set APP_URL to the public URL of the deployment to pin it.
 */
export function getAppOrigin(req: NextRequest): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  console.warn("[security] APP_URL is not set — emailed links use the request Host header, which can be spoofed. Set APP_URL in .env.");
  return req.nextUrl.origin;
}
