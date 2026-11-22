import { SignJWT, jwtVerify } from "jose";

// Edge-safe (Web Crypto only via jose) — this is what src/middleware.ts uses
// to verify the session cookie on every request without needing Prisma or
// any Node-only API in the Edge runtime.

export const SESSION_COOKIE_NAME = "bv_session";
const SESSION_LIFETIME = "7d";

export interface SessionClaims {
  userId: string;
  username: string;
  role: "admin" | "member";
  // Set at login time from the User row. Middleware redirects to
  // /change-password whenever this is true — see src/middleware.ts. Changing
  // password issues a fresh token with this cleared, so no re-login needed.
  mustChangePassword: boolean;
  // The user's sessionVersion when this token was issued. Bumping User.sessionVersion (password change/reset,
  // role change, "sign out everywhere") makes every older token fail getVerifiedUser() — see current-user.ts.
  sv: number;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) throw new Error("AUTH_SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_LIFETIME)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.userId !== "string" ||
      typeof payload.username !== "string" ||
      (payload.role !== "admin" && payload.role !== "member")
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      username: payload.username,
      role: payload.role,
      mustChangePassword: payload.mustChangePassword === true,
      // Tokens issued before sessionVersion existed have no `sv`; they match the column's default of 0.
      sv: typeof payload.sv === "number" && Number.isInteger(payload.sv) ? payload.sv : 0,
    };
  } catch {
    return null;
  }
}
