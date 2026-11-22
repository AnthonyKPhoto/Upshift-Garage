import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthEnabled } from "@/lib/auth/password";
import { getSetupCode } from "@/lib/auth/setup-code";

// Must never be cached — see the identical note in src/app/api/health/route.ts.
// This route's entire purpose is detecting a state transition (0 users →
// 1 user), so a build-time-cached response is actively wrong, not just stale.
export const dynamic = "force-dynamic";

// Unauthenticated on purpose — the login page needs this before any session
// exists, to decide whether to show "sign in" or "create the admin account".
export async function GET() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ needsSetup: false });
  }
  const userCount = await prisma.user.count();
  if (userCount === 0) getSetupCode(); // prints the code to the server log (once per process)
  return NextResponse.json({ needsSetup: userCount === 0 });
}
