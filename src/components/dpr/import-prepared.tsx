"use client";
/**
 * DPR desk → Import prepared DPRs (owner, 2026-11-21): a file made from the MS-SGE daily DPR
 * sheets (scaffolding, painting, rope access, standing scaffolding). Shows what is new, then adds
 * it through the work store so every device gets it. Records already here (same id) are skipped.
 */
import { useState } from "react";
import { Panel } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useWork, type PreparedImport } from "@/lib/work/store";

export function ImportPrepared() {
  const { state } = useStore();
  const { work, importPrepared } = useWork();
  const [file, setFile] = useState<{ name: string; data: PreparedImport } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (state.currentRole !== "owner" && state.currentRole !== "super_admin") return null;

  const count = (list: { id?: string; code?: string }[] | undefined, have: Set<string>) =>
    (list ?? []).filter((x) => !have.has(String(x.id ?? x.code))).length;
  const preview = file
    ? [
        ["DPRs", file.data.reports?.length ?? 0, count(file.data.reports, new Set(work.reports.map((x) => x.id)))],
        ["Work lines (painting)", file.data.dprs?.length ?? 0, count(file.data.dprs, new Set(work.dprs.map((x) => x.id)))],
        ["Jobs", file.data.jobs?.length ?? 0, count(file.data.jobs, new Set(work.jobs.map((x) => x.id)))],
        ["Plan lines", file.data.planLines?.length ?? 0, count(file.data.planLines, new Set(work.planLines.map((x) => x.id)))],
        ["Service items", file.data.serviceItems?.length ?? 0, count(file.data.serviceItems, new Set(work.serviceItems.map((x) => x.code)))],
      ]
    : [];
  const scaffoldLines = (file?.data.reports ?? []).reduce((n, r) => n + (r.scaffoldWork?.length ?? 0), 0);
  const dates = (file?.data.reports ?? []).map((r) => r.date).sort();

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-heading text-sm font-bold uppercase tracking-wide">Import prepared DPRs</div>
          <p className="text-xs text-[var(--sge-ink-3)]">Owner / Super Admin · a file prepared from the MS-SGE daily DPR sheets. Only records not already here are added.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-3 py-1.5 text-xs font-semibold">
          Choose file…
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={async (e) => {
              setMsg(null);
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const data = JSON.parse(await f.text()) as PreparedImport;
                if (data?.kind !== "sge-prepared-dprs") throw new Error("not prepared");
                setFile({ name: f.name, data });
              } catch {
                setFile(null);
                setMsg({ ok: false, text: `${f.name} isn't a prepared DPR file` });
              }
            }}
          />
        </label>
      </div>
      {file ? (
        <div className="mt-3 space-y-2 text-sm">
          <div className="text-xs text-[var(--sge-ink-2)]">
            <b>{file.name}</b> · {file.data.source}
            {dates.length ? ` · ${dates[0]} to ${dates[dates.length - 1]}` : ""} · {scaffoldLines} scaffold lines inside the DPRs
          </div>
          <table className="text-sm [&_td]:px-3 [&_td]:py-1 [&_th]:px-3 [&_th]:py-1">
            <thead className="text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
              <tr><th className="text-left">What</th><th className="text-right">In file</th><th className="text-right">New</th></tr>
            </thead>
            <tbody>
              {preview.map(([label, all, fresh]) => (
                <tr key={String(label)} className="border-t border-[var(--sge-line)]">
                  <td>{label}</td>
                  <td className="text-right tabular-nums">{all}</td>
                  <td className="text-right font-semibold tabular-nums">{fresh}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                const r = importPrepared(file.data);
                if (!r.ok) return setMsg({ ok: false, text: r.error });
                setMsg({ ok: true, text: `Imported: ${Object.entries(r.added).map(([k, v]) => `${v} ${k}`).join(", ")}. Every device gets them within a minute.` });
                setFile(null);
              }}
            >
              Import
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFile(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}
      {msg ? <p className={`mt-2 text-xs ${msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]"}`}>{msg.text}</p> : null}
    </Panel>
  );
}
