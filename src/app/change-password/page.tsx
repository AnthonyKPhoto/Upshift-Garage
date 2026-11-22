"use client";

import { useEffect, useState, FormEvent } from "react";
import { KeyRound, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default function ChangePasswordPage() {
  const [current,  setCurrent]  = useState("");
  // Forced first change (temp password) → no current password; voluntary change → required.
  const [requiresCurrent, setRequiresCurrent] = useState(false);
  useEffect(() => {
    fetch("/api/auth/change-password").then(async (r) => {
      if (r.status === 401) { window.location.href = "/login"; return; }
      const d = await r.json().catch(() => null);
      setRequiresCurrent(!!d?.requiresCurrent);
    }).catch(() => {});
  }, []);
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const mismatch = confirm.length > 0 && password !== confirm;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || mismatch || (requiresCurrent && !current)) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password, ...(requiresCurrent ? { currentPassword: current } : {}) }),
      });
      if (res.ok) {
        // Full reload so the refreshed session cookie (mustChangePassword
        // cleared) is guaranteed to be present for middleware next request.
        window.location.href = "/";
      } else {
        const data = await res.json();
        setError(data.error || "Couldn't change password");
      }
    } catch {
      setError("Failed to change password — try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-overlay className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <Logo size={72} className="mx-auto mb-4 rounded-[20px] shadow-lg shadow-black/30" />
          <h1 className="text-2xl font-bold tracking-tight">{requiresCurrent ? "Change your password" : "Set a new password"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {requiresCurrent ? "Your other devices will be signed out." : "Choose your own password to continue"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {requiresCurrent && (
            <input
              type={showPw ? "text" : "password"}
              placeholder="Current password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoFocus
              className="w-full px-4 py-3 text-sm rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-theme/30"
            />
          )}
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus={!requiresCurrent}
              className="w-full px-4 py-3 pr-11 text-sm rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-theme/30"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <input
            type={showPw ? "text" : "password"}
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full px-4 py-3 text-sm rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-theme/30"
          />
          {mismatch && (
            <div className="flex items-center gap-2 text-xs text-red-400 px-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Passwords don't match
            </div>
          )}

          <button
            type="submit"
            disabled={!password || mismatch || loading || (requiresCurrent && !current)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-theme text-white font-medium text-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Saving…" : "Save password"}
          </button>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 px-1 pt-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
