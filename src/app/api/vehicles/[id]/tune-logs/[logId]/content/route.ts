import { NextRequest, NextResponse } from "next/server";
import { safeJoin, tuneLogsRoot } from "@/lib/files-root";
import { prisma } from "@/lib/prisma";
import fs from "fs";


export async function GET(_req: NextRequest, { params }: { params: { id: string; logId: string } }) {
  const log = await prisma.tuneLog.findUnique({ where: { id: params.logId } });
  if (!log || log.vehicleId !== params.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = safeJoin(tuneLogsRoot(), params.id, log.filename);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return new NextResponse(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
}
