"use client";
/**
 * Owner, 2026-11-18: a tab left open on an older version kept writing old copies over newer
 * data. Every 5 minutes (and when the tab comes back into view) this asks which version is
 * live; if it's newer, the tab reloads itself as soon as nothing is waiting to be saved.
 */
import { useEffect, useRef } from "react";

const MINE = process.env.NEXT_PUBLIC_BUILD_COMMIT || "dev";

export function VersionCheck({ busy }: { busy: boolean }) {
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    if (MINE === "dev") return;
    let stale = false;
    const check = async () => {
      try {
        if (!stale) {
          const r = await fetch("/api/version", { cache: "no-store" });
          const { commit } = (await r.json()) as { commit?: string };
          stale = !!commit && commit !== "dev" && commit !== MINE;
        }
        if (stale && !busyRef.current) window.location.reload();
      } catch {
        /* offline — try again later */
      }
    };
    const t = setInterval(check, 5 * 60 * 1000);
    const fast = setInterval(() => { if (stale && !busyRef.current) window.location.reload(); }, 5000);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    void check();
    return () => { clearInterval(t); clearInterval(fast); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
  }, []);
  return null;
}
