import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

// One place for the session cookie, so every route that signs someone in sets it the same way.
//
// `secure` defaults to true: a real deployment sits behind HTTPS. COOKIE_SECURE=false is an explicit
// opt-out for a plain-http LAN install — without it the browser silently drops a Secure cookie on
// http://192.168.x.x and the login appears to just bounce back to the form.
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== "false",
    sameSite: "strict" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

/** Signs a session for this user and sets it on `res`. `sessionVersion` is the user's current value (see SEC-06). */
export async function setSessionCookie(
  res: NextResponse,
  user: { id: string; username: string; role: string; mustChangePassword: boolean; sessionVersion: number }
): Promise<NextResponse> {
  const token = await createSessionToken({
    userId: user.id,
    username: user.username,
    role: user.role === "admin" ? "admin" : "member",
    mustChangePassword: user.mustChangePassword,
    sv: user.sessionVersion,
  });
  res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE_NAME, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
