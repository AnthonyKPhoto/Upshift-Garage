import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/cookie";
import { bumpSessionVersion, getVerifiedUser } from "@/lib/auth/current-user";

// POST            → sign out this browser.
// POST ?all=1     → sign out everywhere: revokes every session this account has (other browsers, phones, the
//                   desktop app), e.g. after a lost device.
export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get("all") === "1") {
    const user = await getVerifiedUser(req);
    if (user) await bumpSessionVersion(user.id);
  }
  return clearSessionCookie(NextResponse.json({ success: true }));
}
