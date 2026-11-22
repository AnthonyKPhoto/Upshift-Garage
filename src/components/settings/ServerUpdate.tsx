"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Info { current: string; latest: string | null; updateAvailable: boolean; releaseUrl: string | null; canUpdate: boolean }

/** Settings → Access & Sync: check for a new version and update the Docker server from the browser. Admin + server mode only. */
export function ServerUpdate() {
  const { toast } = useToast();
  const [info, setInfo] = useState<Info | null>(null);
  const [hidden, setHidden] = useState(false);
  const [checking, setChecking] = useState(false);
  const [phase, setPhase] = useState<"idle" | "confirm" | "updating">("idle");
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setChecking(true);
    try {
      const r = await fetch("/api/admin/update");
      if (!r.ok) { setHidden(true); return; }
      setInfo(await r.json());
    } catch { setHidden(true); }
    finally { setChecking(false); }
  }, []);
  useEffect(() => { load(); return () => { if (timer.current) clearInterval(timer.current); }; }, [load]);

  const start = async () => {
    if (!info) return;
    setPhase("updating"); setStatus("Backing up and asking the server to update…");
    try {
      const r = await fetch("/api/admin/update", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Couldn't start the update");
    } catch (e) {
      setPhase("idle");
      toast({ title: "Update didn't start", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
      return;
    }
    // The container is replaced in a few seconds: wait for the old version to go away, then for a NEW one to answer.
    setStatus("Updating — the server restarts for a moment…");
    const from = info.current;
    const began = Date.now();
    let wentDown = false;
    timer.current = setInterval(async () => {
      let ver: string | null = null;
      try {
        const h = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(4000) });
        if (h.ok) ver = (await h.json()).version ?? null;
      } catch { /* down — expected during the swap */ }
      if (ver == null) wentDown = true;
      if (ver && ver !== from) {
        if (timer.current) clearInterval(timer.current);
        setStatus(`Updated to ${ver}. Reloading…`);
        setTimeout(() => window.location.reload(), 1200);
      } else if (Date.now() - began > 6 * 60_000) {
        if (timer.current) clearInterval(timer.current);
        setPhase("idle");
        toast({
          title: wentDown ? "Server is back, but still on the old version" : "No update happened",
          description: "No newer image was found, or the updater couldn't reach the registry. Check the updater container's logs.",
          variant: "destructive",
        });
        load();
      }
    }, 3000);
  };

  if (hidden || !info) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border/60">
        <div className="w-7 h-7 rounded-lg bg-theme/10 flex items-center justify-center"><ArrowUpCircle className="w-3.5 h-3.5 text-theme" strokeWidth={2.2} /></div>
        <h3 className="font-semibold text-sm">Server updates</h3>
        <button onClick={load} disabled={checking || phase === "updating"} className="ml-auto text-muted-foreground hover:text-foreground disabled:opacity-50" aria-label="Check for updates">
          <RefreshCw className={cn("w-3.5 h-3.5", checking && "animate-spin")} />
        </button>
      </div>
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium">Running version {info.current}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {info.latest == null ? "Couldn't check for a newer release right now."
                : info.updateAvailable ? `Version ${info.latest} is available.`
                : <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-400" />You're up to date.</span>}
              {info.releaseUrl && info.updateAvailable && <> <a href={info.releaseUrl} target="_blank" rel="noopener noreferrer" className="text-theme hover:underline inline-flex items-center gap-0.5">What&apos;s new<ExternalLink className="w-3 h-3" /></a></>}
            </p>
          </div>
          {phase === "idle" && (
            <button onClick={() => setPhase("confirm")} disabled={!info.canUpdate}
              className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all disabled:opacity-50",
                info.updateAvailable ? "bg-theme text-white hover:brightness-90" : "border border-border bg-secondary hover:bg-accent")}>
              <ArrowUpCircle className="w-3.5 h-3.5" />{info.updateAvailable ? "Update now" : "Check & update"}
            </button>
          )}
        </div>

        {phase === "confirm" && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm space-y-2">
            <p>The server takes a database backup, pulls the newest image and restarts. The site is unavailable for about a minute, then this page reloads on the new version. Your data stays on the volume.</p>
            <div className="flex gap-2">
              <button onClick={start} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-theme text-white hover:brightness-90">Update server</button>
              <button onClick={() => setPhase("idle")} className="px-3 py-1.5 text-sm rounded-lg border border-border bg-secondary hover:bg-accent">Cancel</button>
            </div>
          </div>
        )}
        {phase === "updating" && (
          <p className="text-sm flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />{status}</p>
        )}

        {!info.canUpdate && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            One-click update isn&apos;t set up on this server. Add <code className="px-1 rounded bg-secondary">UPDATE_TOKEN=&lt;any long random string&gt;</code> to the <code className="px-1 rounded bg-secondary">.env</code> next to
            <code className="px-1 rounded bg-secondary"> docker-compose.yml</code>, then run <code className="px-1 rounded bg-secondary">docker compose pull && docker compose up -d</code> once (the updated compose file wires it to Watchtower).
          </p>
        )}
      </div>
    </div>
  );
}
