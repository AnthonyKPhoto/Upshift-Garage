/** True when semver `latest` is strictly newer than `current` (x.y.z only). */
export function isNewer(latest: string, current: string): boolean {
  const a = latest.split(".").map(Number), b = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}
