import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth/cookie";
import { getVerifiedUser } from "@/lib/auth/current-user";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Requires an existing session (middleware verified it and attached x-user-id). Used for the forced first
// change after an admin-created temp password (no current password needed — the user never chose one), and
// for a voluntary change, which must prove the current password: otherwise a borrowed unlocked browser or a
// stolen cookie could take the account over for good.
const schema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(8).max(200),
});

async function currentUser(req: NextRequest) {
  const verified = await getVerifiedUser(req); // also rejects revoked sessions
  return verified ? prisma.user.findUnique({ where: { id: verified.id } }) : null;
}

function gone() {
  return clearSessionCookie(NextResponse.json({ error: "Your session has ended — sign in again." }, { status: 401 }));
}

// GET → whether the form must ask for the current password.
export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return gone();
  return NextResponse.json({ requiresCurrent: !user.mustChangePassword });
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const existing = await currentUser(req);
  if (!existing) return gone();

  if (!existing.mustChangePassword) {
    if (!body.currentPassword || !verifyPassword(body.currentPassword, existing.passwordHash)) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }
  }

  // Bumping sessionVersion signs every OTHER device out; this one gets a fresh token below.
  const user = await prisma.user.update({
    where: { id: existing.id },
    data: { passwordHash: hashPassword(body.newPassword), mustChangePassword: false, sessionVersion: { increment: 1 } },
  });
  return setSessionCookie(NextResponse.json({ success: true }), user);
}
