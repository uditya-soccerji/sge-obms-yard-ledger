"use client";

import { guarded } from "@/components/shared/require-module";
import { daysAgo } from "@/lib/today";
import { useState } from "react";
import {
  EmptyState,
  KpiTile,
  Panel,
  SectionHeader,
  StatusPill,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import type { AcplMatchFlag, AcplResolveStatus } from "@/lib/types";

const FLAG_TONE: Record<
  AcplMatchFlag,
  "ok" | "warn" | "crit" | "accent" | "default"
> = {
  match: "ok",
  time_mismatch: "warn",
  dpr_only: "accent",
  acpl_only: "crit",
  punched_but_absent: "crit",
};

const SAMPLE_CSV = `PP5920188440,Mahesh Rathod,07:52,18:02
5920188441,Anil Prajapati,08:20,18:10
PP5920188499,Unknown punch,09:00,17:00
PP5920188421,Ramesh Kumar,07:58,18:05`;

function AcplMatchPage() {
  const { state, uploadAcplText, runAcplMatch, resolveAcplFlag } = useStore();
  // Gate punches are uploaded the next morning: default to yesterday
  const [date, setDate] = useState(() => daysAgo(1));
  const [paste, setPaste] = useState(SAMPLE_CSV);
  const [msg, setMsg] = useState<string | null>(null);

  const role = state.currentRole;
  const canHrResolve =
    role === "hr" || role === "super_admin";
  const canSicOverride =
    role === "sic" || role === "super_admin" || role === "owner";

  const matches = state.acplMatches.filter((m) => m.date === date);
  const open = matches.filter((m) => m.resolveStatus === "open");
  const flags = open.filter((m) => m.flag !== "match");

  function handleUpload() {
    const n = uploadAcplText(paste, date, "paste");
    setMsg(`Imported ${n} ACPL punch rows for ${date}.`);
  }

  function handleFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const n = uploadAcplText(text, date, "upload");
      setMsg(`Uploaded ${file.name} — ${n} rows.`);
    };
    reader.readAsText(file);
  }

  function handleMatch() {
    const n = runAcplMatch(date);
    setMsg(`Matched ${n} rows vs SIC-approved DPRs for ${date}.`);
  }

  function resolve(
    id: string,
    status: AcplResolveStatus,
    opts?: { sicOverride?: boolean }
  ) {
    const r = resolveAcplFlag(id, status, `Resolved as ${status}`, opts);
    if (!r.ok) {
      setMsg(r.error ?? "Resolve blocked");
      return;
    }
    setMsg(
      opts?.sicOverride
        ? `SIC override applied (${status}).`
        : `Flag resolved (${status}).`
    );
  }

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="ACPL attendance match"
        subtitle="Upload RIL ACPL punching list (CSV / paste) → match against SIC-approved DPR attendance → HR resolve flags."
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <KpiTile label="Punches loaded" value={String(state.acplPunches.length)} />
        <KpiTile label="Matches (day)" value={String(matches.length)} />
        <KpiTile label="Open flags" value={String(flags.length)} tone="warn" />
        <KpiTile
          label="Approved DPRs (day)"
          value={String(
            state.dprDocuments.filter(
              (d) => d.date === date && d.status === "sic_approved"
            ).length
          )}
          tone="ok"
        />
      </div>

      {msg ? (
        <div className="rounded-md border border-[var(--sge-ok)]/30 bg-[var(--sge-ok-wash)] px-3 py-2 text-sm text-[var(--sge-ok)]">
          {msg}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">Upload / paste</h3>
          <div className="mb-3">
            <Label>Match date</Label>
            <Input
              type="date"
              className="mt-1"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="mb-3">
            <Label>CSV / paste (EP, Name, In, Out)</Label>
            <Textarea
              className="mt-1 font-mono text-xs"
              rows={8}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
          </div>
          <div className="mb-3">
            <Label>Or choose CSV / XLSX-as-CSV file</Label>
            <Input
              type="file"
              accept=".csv,.txt,.tsv"
              className="mt-1"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            <p className="mt-1 text-[11px] text-[var(--sge-ink-3)]">
              Testing ground: paste or CSV. Export XLSX as CSV if needed.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handleUpload}>
              Import paste
            </Button>
            <Button type="button" onClick={handleMatch}>
              Run match vs approved DPRs
            </Button>
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">
            How matching works
          </h3>
          <ul className="list-inside list-disc space-y-1 text-sm text-[var(--sge-ink-2)]">
            <li>
              <strong>match</strong> — DPR and gate agree: worked with in/out within 15 min, or absent with no punch
            </li>
            <li>
              <strong>time_mismatch</strong> — both say worked, but in- or out-time differs &gt;15 min
            </li>
            <li>
              <strong>dpr_only</strong> — on approved DPR, missing in ACPL
            </li>
            <li>
              <strong>acpl_only</strong> — punched in ACPL, not on any approved DPR
            </li>
            <li>
              <strong>punched_but_absent</strong> — marked absent / leave / off on the DPR, but punched in at the gate
            </li>
            <li>
              EPs are matched as <code>PP</code> + 10 digits (a bare 10-digit code gets its PP); an unknown EP falls back to the labourer&apos;s name, shown as &quot;matched by name&quot;.
            </li>
          </ul>
          <p className="mt-3 text-sm text-[var(--sge-ink-2)]">
            Tip: approve scaffolding DPR for 4 Oct in SIC inbox first (already
            approved in seed), then re-run match — or approve today&apos;s
            painting DPRs and match on 2026-10-05.
          </p>
        </Panel>
      </div>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
          Match results · {date}
        </h3>
        {matches.length === 0 ? (
          <EmptyState
            title="No match rows for this date"
            detail="Import punches and run match against SIC-approved DPRs."
          />
        ) : (
          <div className="space-y-2">
            {matches.map((m) => {
              const name =
                state.labourers.find((l) => l.id === m.labourerId)?.name ??
                m.epNumber;
              return (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={FLAG_TONE[m.flag]}>
                        {m.flag.replace("_", " ")}
                      </StatusPill>
                      <span className="text-sm font-semibold">{name}</span>
                      <span className="font-mono text-xs text-[var(--sge-ink-3)]">
                        {m.epNumber}
                      </span>
                      {m.matchedBy === "name" ? (
                        <StatusPill tone="warn">matched by name — check EP</StatusPill>
                      ) : null}
                      {m.resolveStatus !== "open" ? (
                        <StatusPill tone="ok">{m.resolveStatus}</StatusPill>
                      ) : null}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-[var(--sge-ink-3)]">
                      DPR {m.dprStatus ?? "—"} in {m.dprInTime ?? "—"} out {m.dprOutTime ?? "—"} · ACPL in{" "}
                      {m.acplInTime ?? "—"} out {m.acplOutTime ?? "—"}
                    </div>
                  </div>
                  {m.resolveStatus === "open" && m.flag !== "match" ? (
                    <div className="flex flex-wrap gap-1">
                      {canHrResolve ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resolve(m.id, "resolved_dpr")}
                          >
                            Keep DPR
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resolve(m.id, "resolved_acpl")}
                          >
                            Prefer ACPL
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => resolve(m.id, "dismissed")}
                          >
                            Dismiss
                          </Button>
                        </>
                      ) : null}
                      {canSicOverride && !canHrResolve ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              resolve(m.id, "resolved_dpr", { sicOverride: true })
                            }
                          >
                            SIC override · DPR
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              resolve(m.id, "resolved_acpl", {
                                sicOverride: true,
                              })
                            }
                          >
                            SIC override · ACPL
                          </Button>
                        </>
                      ) : null}
                      {!canHrResolve && !canSicOverride ? (
                        <span className="text-xs text-[var(--sge-ink-3)]">
                          HR resolves; SIC can override
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("acpl", AcplMatchPage);
