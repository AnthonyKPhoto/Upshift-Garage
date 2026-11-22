import path from "path";

// Where uploaded vehicle files and tune logs live, and a path builder that can't escape it.
// (BUILDVERSE_DATA_DIR is the Docker volume / Electron userData; see CLAUDE.md.)

export function dataDir(): string {
  return process.env.BUILDVERSE_DATA_DIR || path.join(process.cwd(), "data");
}
export const vehicleFilesRoot = () => path.join(dataDir(), "vehicle-files");
export const tuneLogsRoot = () => path.join(dataDir(), "tune-logs");

/**
 * path.join that refuses to leave `root`. Stored file names are generated server-side today, but they come
 * back out of the database — a restored backup or imported pack could carry "../" — so never trust them.
 */
export function safeJoin(root: string, ...parts: string[]): string {
  const base = path.resolve(root);
  const full = path.resolve(base, ...parts);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error("Path escapes the files folder");
  return full;
}

/** Content-Disposition with an ASCII fallback plus the real (UTF-8) name, per RFC 6266 / 5987. */
export function contentDisposition(kind: "inline" | "attachment", name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_") || "download";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())}`;
}
