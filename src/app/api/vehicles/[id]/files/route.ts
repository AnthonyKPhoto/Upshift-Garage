import { NextRequest, NextResponse } from "next/server";
import { safeJoin, vehicleFilesRoot } from "@/lib/files-root";
import { prisma } from "@/lib/prisma";
import { canEditVehicle, VEHICLE_ACCESS_DENIED } from "@/lib/auth/vehicle-access";
import { randomUUID } from "crypto";
import fs from "fs";

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg":   "jpg",
  "image/png":    "png",
  "image/gif":    "gif",
  "image/webp":   "webp",
  "image/avif":   "avif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain":   "txt",
};

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB


export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const files = await prisma.vehicleFile.findMany({
    where: { vehicleId: params.id },
    orderBy: { uploadedAt: "desc" },
  });
  return NextResponse.json(files);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await canEditVehicle(req, params.id))) {
    return NextResponse.json(VEHICLE_ACCESS_DENIED, { status: 403 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 50 MB)" }, { status: 413 });
  }
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 50 MB)" }, { status: 413 });

  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME[mime]) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 415 });
  }

  const id = randomUUID();
  const ext = ALLOWED_MIME[mime];
  const storedName = `${id}.${ext}`;
  const vehicleDir = safeJoin(vehicleFilesRoot(), params.id);

  fs.mkdirSync(vehicleDir, { recursive: true });

  const bytes = await file.arrayBuffer();
  fs.writeFileSync(safeJoin(vehicleDir, storedName), Buffer.from(bytes));

  const record = await prisma.vehicleFile.create({
    data: {
      id,
      vehicleId: params.id,
      filename: storedName,
      originalName: file.name,
      mimeType: mime,
      size: file.size,
    },
  });

  return NextResponse.json(record, { status: 201 });
}
