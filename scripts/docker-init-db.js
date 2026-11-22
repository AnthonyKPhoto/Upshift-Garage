/**
 * docker-init-db.js
 * Runs once at container startup, before the Next.js server starts.
 *
 * Three jobs, all idempotent so they're safe to run on every boot:
 *  1. Reconcile the schema (`prisma db push`) — handles a fresh empty volume,
 *     an existing volume after the image ships a schema change, AND a
 *     database restored from an old Electron backup via /api/admin/restore-db
 *     that may predate newer tables (e.g. User).
 *  2. Ensure a bootstrap admin account exists whenever ADMIN_USERNAME/
 *     ADMIN_PASSWORD_HASH are set and no admin currently exists — this is
 *     what makes restoring an old backup (which has zero User rows) recover
 *     on its own instead of locking everyone out permanently.
 *  3. Enable SQLite WAL mode for better concurrent multi-client writes.
 *
 * Usage: node scripts/docker-init-db.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── Refuse to start an open server by accident ────────────────────────────────
// No AUTH_SESSION_SECRET = no login at all: every visitor is effectively admin. That's almost always a
// missing/blank .env, so stop here unless the operator explicitly asked for it with ALLOW_NO_AUTH=1.
// A short secret only warns (a running server mustn't crash-loop on an image update), but it should be
// replaced: session cookies are HS256-signed with it and a short one can be brute-forced offline.
{
  const secret = process.env.AUTH_SESSION_SECRET || "";
  if (!secret && process.env.ALLOW_NO_AUTH !== "1") {
    console.error(
      "\n[docker-init-db] AUTH_SESSION_SECRET is not set, so this server would run with NO LOGIN — anyone\n" +
      "who can reach it could view, change or wipe everything. Refusing to start.\n\n" +
      "  Fix: put AUTH_SESSION_SECRET=<long random string> in the .env next to docker-compose.yml\n" +
      "       (generate one with: openssl rand -hex 32), then run: docker compose up -d\n" +
      "  Or, to run without login on purpose (trusted network only): set ALLOW_NO_AUTH=1.\n"
    );
    process.exit(1);
  }
  if (secret && secret.length < 32) {
    console.warn("[docker-init-db] WARNING: AUTH_SESSION_SECRET is shorter than 32 characters. Replace it with `openssl rand -hex 32` (everyone will need to sign in again).");
  }
  if (!secret) console.warn("[docker-init-db] WARNING: authentication is DISABLED (ALLOW_NO_AUTH=1).");
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL || !DATABASE_URL.startsWith("file:")) {
  console.error("[docker-init-db] DATABASE_URL must be a file: URL, got:", DATABASE_URL);
  process.exit(1);
}

// Strip the file: prefix and any query params (e.g. ?connection_limit=1)
// added by src/lib/prisma.ts to get the real filesystem path. Prisma resolves
// a relative sqlite URL relative to prisma/schema.prisma's directory, not
// process.cwd() — match that convention so this never touches the wrong file.
// (Docker's DATABASE_URL is always an absolute path in practice; this only
// matters for relative paths used in local testing.)
const strippedUrl = DATABASE_URL.replace(/^file:/, "").split("?")[0];
const dbPath = path.isAbsolute(strippedUrl)
  ? strippedUrl
  : path.join(__dirname, "..", "prisma", strippedUrl);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

function isDatabaseInitialized(file) {
  if (!fs.existsSync(file)) return false;
  try {
    const buf = Buffer.alloc(32);
    const fd = fs.openSync(file, "r");
    const bytesRead = fs.readSync(fd, buf, 0, 32, 0);
    fs.closeSync(fd);
    if (bytesRead < 32) return false;
    if (buf.toString("ascii", 0, 6) !== "SQLite") return false;
    const pageCount = buf.readUInt32BE(28); // page 1 is schema-only; more means real tables
    return pageCount > 1;
  } catch {
    return false;
  }
}

console.log(
  isDatabaseInitialized(dbPath)
    ? `[docker-init-db] Existing database found at ${dbPath} — reconciling schema…`
    : `[docker-init-db] No database found at ${dbPath} — creating…`
);
// `db push --accept-data-loss` can drop columns/tables on a schema change.
// Keep a copy of the database from just before it runs so an upgrade can
// always be rolled back (one rolling backup, next to the live file).
if (isDatabaseInitialized(dbPath)) {
  try {
    fs.copyFileSync(dbPath, `${dbPath}.pre-update.bak`);
    for (const ext of ["-wal", "-shm"]) {
      if (fs.existsSync(dbPath + ext)) fs.copyFileSync(dbPath + ext, `${dbPath}.pre-update.bak${ext}`);
    }
    console.log(`[docker-init-db] Backed up database to ${dbPath}.pre-update.bak`);
  } catch (err) {
    console.warn("[docker-init-db] Could not back up database before schema update:", err.message);
  }
}
execSync("node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss", {
  cwd: path.join(__dirname, ".."),
  env: process.env,
  stdio: "inherit",
});

async function ensureAdminAndWAL() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  try {
    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
    if (adminPasswordHash) {
      const adminCount = await prisma.user.count({ where: { role: "admin" } });
      if (adminCount === 0) {
        await prisma.user.upsert({
          where: { username: adminUsername },
          update: { role: "admin", passwordHash: adminPasswordHash },
          create: { username: adminUsername, role: "admin", passwordHash: adminPasswordHash },
        });
        console.log(`[docker-init-db] Bootstrap admin "${adminUsername}" ensured.`);
      }
    }

    // journal_mode is persisted in the file itself, so this is a no-op after
    // the first boot — but it's cheap, so just run it every time. Must use
    // $queryRawUnsafe (not $executeRawUnsafe): PRAGMA journal_mode returns a
    // row with the resulting mode, and SQLite rejects executing a statement
    // that returns rows via the "execute" path.
    await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
    console.log("[docker-init-db] WAL mode enabled.");
  } finally {
    await prisma.$disconnect();
  }
}

ensureAdminAndWAL().catch((err) => {
  console.error("[docker-init-db] Startup check failed:", err.message);
  process.exit(1);
});
