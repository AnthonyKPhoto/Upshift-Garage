import { NextRequest, NextResponse } from "next/server";
import { safeJoin, tuneLogsRoot } from "@/lib/files-root";
import { prisma } from "@/lib/prisma";
import { canEditVehicle, VEHICLE_ACCESS_DENIED } from "@/lib/auth/vehicle-access";
import fs from "fs";


export async function DELETE(req: NextRequest, { params }: { params: { id: string; logId: string } }) {
  if (!(await canEditVehicle(req, params.id))) {
    return NextResponse.json(VEHICLE_ACCESS_DENIED, { status: 403 });
  }
  const log = await prisma.tuneLog.findUnique({ where: { id: params.logId } });
  if (!log || log.vehicleId !== params.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = safeJoin(tuneLogsRoot(), params.id, log.filename);
  try { fs.unlinkSync(filePath); } catch { /* file already gone */ }

  await prisma.tuneLog.delete({ where: { id: params.logId } });
  return NextResponse.json({ ok: true });
}
