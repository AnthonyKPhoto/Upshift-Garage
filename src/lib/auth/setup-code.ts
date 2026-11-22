import crypto from "crypto";

// First-run setup code (like Jellyfin / Portainer). Until the first account exists, /api/auth/setup is
// public — so whoever reached a freshly started server first could claim admin. The code is printed only
// to the server log, so only someone who can read the logs (the person who deployed it) can finish setup.
//
// Generated lazily the first time the login page asks whether setup is needed, kept for the life of the
// process (a restart prints a new one).

const g = globalThis as unknown as { __bvSetupCode?: string };

export function getSetupCode(): string {
  if (!g.__bvSetupCode) {
    // 10 characters from an alphabet without look-alikes (no 0/O, 1/I/L)
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const bytes = crypto.randomBytes(10);
    g.__bvSetupCode = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    const line = "=".repeat(60);
    console.log(`\n${line}\n  Upshift Garage first-run setup code:  ${g.__bvSetupCode}\n  Enter it on the setup page to create the admin account.\n${line}\n`);
  }
  return g.__bvSetupCode;
}

export function checkSetupCode(input: unknown): boolean {
  if (typeof input !== "string") return false;
  const a = Buffer.from(input.trim().toUpperCase().replace(/[\s-]/g, ""));
  const b = Buffer.from(getSetupCode());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function clearSetupCode() {
  delete g.__bvSetupCode;
}
