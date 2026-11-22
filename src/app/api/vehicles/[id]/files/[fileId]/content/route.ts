import { NextRequest, NextResponse } from "next/server";
import { safeJoin, vehicleFilesRoot, contentDisposition } from "@/lib/files-root";
import { prisma } from "@/lib/prisma";
import fs from "fs";


const SAFE_INLINE_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "application/pdf", "text/plain",
]);

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  const record = await prisma.vehicleFile.findFirst({
    where: { id: params.fileId, vehicleId: params.id },
  });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filePath = safeJoin(vehicleFilesRoot(), params.id, record.filename);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File missing from disk" }, { status: 404 });
  }

  // Only types that can't execute script are served inline with their own
  // type. Anything else (a record's mimeType can come from an imported
  // database, not just the upload whitelist) is forced to a download.
  const safe = SAFE_INLINE_TYPES.has(record.mimeType);
  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": safe ? record.mimeType : "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      "Content-Disposition": contentDisposition(safe ? "inline" : "attachment", record.originalName),
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
