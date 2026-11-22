import { NextRequest, NextResponse } from "next/server";
import { safeJoin, vehicleFilesRoot } from "@/lib/files-root";
import { prisma } from "@/lib/prisma";
import { canEditVehicle, VEHICLE_ACCESS_DENIED } from "@/lib/auth/vehicle-access";
import fs from "fs";


export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  if (!(await canEditVehicle(req, params.id))) {
    return NextResponse.json(VEHICLE_ACCESS_DENIED, { status: 403 });
  }
  const record = await prisma.vehicleFile.findFirst({
    where: { id: params.fileId, vehicleId: params.id },
  });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filePath = safeJoin(vehicleFilesRoot(), params.id, record.filename);
  try { fs.unlinkSync(filePath); } catch { /* file may already be gone */ }

  await prisma.vehicleFile.delete({ where: { id: params.fileId } });

  return new NextResponse(null, { status: 204 });
}
