import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs";
import { attachmentsRoot } from "@/lib/transfer-pack";

// GET /api/export-zip
// Streams a transfer-pack ZIP for the server/Docker deployment.
// Same format as the Electron desktop export so it can be imported back
// via Settings → "Add Vehicles from Transfer Pack" on any install.
export const dynamic = "force-dynamic";

function dbFilePath(): string | null {
  const raw = process.env.BV_DATABASE_URL || process.env.DATABASE_URL || "";
  // Strip file: prefix and any Prisma query string params
  const match = raw.match(/^file:(.+?)(\?.*)?$/);
  if (!match) return null;
  const p = match[1];
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

// The pack is the whole database (every user's data, password hashes, SMTP/LubeLogger settings) plus every
// uploaded file, so it's admin-only — same as restore. In local/desktop mode the single user is the admin.
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req, true);
  if (denied) return denied;
  const dbPath = dbFilePath();
  if (!dbPath || !fs.existsSync(dbPath)) {
    return NextResponse.json({ error: "Database file not found" }, { status: 500 });
  }

  try {
    const zip = new AdmZip();

    // ── 1. Database ──────────────────────────────────────────────────────────
    zip.addFile("buildverse.db", fs.readFileSync(dbPath));

    // ── 2. Vehicle attachments ───────────────────────────────────────────────
    const attachRoot = attachmentsRoot();
    const vehicleFilesDir = path.join(attachRoot, "vehicle-files");
    const tuneLogsDir = path.join(attachRoot, "tune-logs");

    const addDirToZip = (dir: string, zipPrefix: string) => {
      if (!fs.existsSync(dir)) return;
      for (const vehicleId of fs.readdirSync(dir)) {
        const vDir = path.join(dir, vehicleId);
        if (!fs.statSync(vDir).isDirectory()) continue;
        for (const filename of fs.readdirSync(vDir)) {
          const filePath = path.join(vDir, filename);
          if (fs.statSync(filePath).isFile()) {
            zip.addFile(
              `${zipPrefix}/${vehicleId}/${filename}`,
              fs.readFileSync(filePath)
            );
          }
        }
      }
    };

    addDirToZip(vehicleFilesDir, "vehicle-files");
    addDirToZip(tuneLogsDir, "tune-logs");

    // ── 3. Stream back as download ───────────────────────────────────────────
    const buffer = zip.toBuffer();
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `upshift-garage-${timestamp}.zip`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
