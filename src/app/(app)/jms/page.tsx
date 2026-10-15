"use client";

import { guarded } from "@/components/shared/require-module";
import { today as todayDate } from "@/lib/today";
import { useState } from "react";
import {
  EmptyState,
  formatINR,
  KpiTile,
  Panel,
  SectionHeader,
  StatusPill,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { effectivePermission } from "@/lib/permissions";
import { ALL_SITES, entrySiteId } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import { useWork } from "@/lib/work/store";
import { compareJms, linkCandidates, parseSubmissionItems, supervisorRatings } from "@/lib/work/jms-compare";
import { JMS_FLOW } from "@/lib/work/logic";
import type { SubmissionStatus } from "@/lib/work/types";
import { WorkExcelTransfer } from "@/components/work/work-excel-transfer";

const STATUSES: SubmissionStatus[] = [...JMS_FLOW.filter((s) => s !== "PAID"), "A1 REJECT"];
const selectCls = "mt-1 h-9 w-full rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm";

/**
 * JMS (docs §10, §14; merge plan Step 6): the internal JMS is what SIC closed
 * in Work; the submitted JMS is the pack sent to RIL, uploaded here. The two
 * are compared — every difference is flagged — and ratings come from them.
 */
function JmsPage() {
  const { state, fullState, currentAccount, addWageEntry } = useStore();
  const { work, uploadSubmission, linkSubmission, unlinkSubmission } = useWork();
  const role = state.currentRole;
  const canUpload = effectivePermission(currentAccount, role, "jms", "upload");
  const canLink = canUpload || effectivePermission(currentAccount, role, "jms", "approve");
  const canPost = role === "owner" || role === "super_admin";
  const allSites = state.currentSiteId === ALL_SITES;
  const onSite = (siteId: string) => allSites || siteId === state.currentSiteId;
  const siteCode = (id: string) => fullState.sites.find((s) => s.id === id)?.code ?? id;
  const lineOf = (planLineId: string) => work.planLines.find((l) => l.id === planLineId);

  const subs = work.submissions.filter((s) => onSite(s.siteId)).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const internal = work.jms.filter((j) => onSite(lineOf(j.planLineId)?.siteId ?? ""));
  const notSubmitted = internal.filter((j) => !j.submissionId);
  const noInternal = subs.filter((s) => !s.jmsId);
  const withDiffs = subs.filter((s) => {
    const j = s.jmsId ? work.jms.find((x) => x.id === s.jmsId) : undefined;
    return j && compareJms(j, s, work).length > 0;
  });
  const ratings = supervisorRatings({ ...work, jms: internal });

  // Upload form
  const formSite = entrySiteId(state);
  const plants = fullState.sites.find((s) => s.id === formSite)?.plants ?? [];
  const wo = work.workOrders.find((w) => w.siteId === formSite);
  const [f, setF] = useState({ rilJmsNo: "", plant: "", woNo: "", foNo: "", periodFrom: "", periodTo: "", status: "JMS SUBMITTED" as SubmissionStatus, invoiceNo: "", excelName: "", pdfName: "", items: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [linkPick, setLinkPick] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  function upload(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseSubmissionItems(f.items);
    if (parsed.error) return setMsg({ ok: false, text: parsed.error });
    const r = uploadSubmission({
      rilJmsNo: f.rilJmsNo,
      siteId: formSite,
      plant: f.plant,
      woNo: f.woNo || wo?.woNo || "",
      foNo: f.foNo || wo?.foNo || undefined,
      periodFrom: f.periodFrom,
      periodTo: f.periodTo,
      items: parsed.items,
      status: f.status,
      invoiceNo: f.invoiceNo || undefined,
      files: { excelName: f.excelName || undefined, pdfName: f.pdfName || undefined },
    });
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    const existed = work.submissions.some((s) => s.rilJmsNo === f.rilJmsNo.trim());
    setMsg({ ok: true, text: existed ? `RIL JMS ${f.rilJmsNo} updated (same number = stage update).` : `RIL JMS ${f.rilJmsNo} uploaded.` });
    set({ rilJmsNo: "", items: "", invoiceNo: "", excelName: "", pdfName: "" });
  }

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="JMS — internal vs submitted to RIL"
        subtitle="Internal JMS = what SIC closed in Work. Submitted JMS = the pack sent to RIL, uploaded by Admin. They are compared, never merged; every difference is flagged."
      />

      <WorkExcelTransfer kind="submissions" />

      <div className="grid gap-3 sm:grid-cols-5">
        <KpiTile label="Internal JMS" value={String(internal.length)} hint={formatINR(internal.reduce((t, j) => t + j.amount, 0))} />
        <KpiTile label="Submitted to RIL" value={String(subs.length)} hint={formatINR(subs.reduce((t, s) => t + s.amount, 0))} tone="accent" />
        <KpiTile label="With differences" value={String(withDiffs.length)} tone={withDiffs.length ? "warn" : "ok"} />
        <KpiTile label="Not submitted yet" value={String(notSubmitted.length)} tone={notSubmitted.length ? "warn" : "ok"} />
        <KpiTile label="No internal JMS" value={String(noInternal.length)} />
      </div>

      {msg ? (
        <div className={msg.ok ? "rounded-md border border-[var(--sge-ok)]/30 bg-[var(--sge-ok-wash)] px-3 py-2 text-sm text-[var(--sge-ok)]" : "rounded-md border border-[var(--sge-crit)]/30 bg-[var(--sge-crit-wash)] px-3 py-2 text-sm text-[var(--sge-crit)]"}>
          {msg.text}
        </div>
      ) : null}

      {canUpload ? (
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">Upload a submitted JMS · {siteCode(formSite)}</h3>
          <form className="grid gap-3 sm:grid-cols-4" onSubmit={upload}>
            <div>
              <Label>RIL JMS no.</Label>
              <Input className="mt-1 font-mono" inputMode="numeric" maxLength={7} placeholder="7 digits" value={f.rilJmsNo} onChange={(e) => set({ rilJmsNo: e.target.value.replace(/\D/g, "") })} />
            </div>
            <div>
              <Label>Plant</Label>
              <select className={selectCls} value={f.plant} onChange={(e) => set({ plant: e.target.value })}>
                <option value="">Pick…</option>
                {plants.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <Label>WO no.</Label>
              <Input className="mt-1" placeholder={wo?.woNo ?? ""} value={f.woNo} onChange={(e) => set({ woNo: e.target.value })} />
            </div>
            <div>
              <Label>RIL status</Label>
              <select className={selectCls} value={f.status} onChange={(e) => set({ status: e.target.value as SubmissionStatus })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <Label>Period from</Label>
              <Input type="date" className="mt-1" max={todayDate()} value={f.periodFrom} onChange={(e) => set({ periodFrom: e.target.value })} />
            </div>
            <div>
              <Label>Period to</Label>
              <Input type="date" className="mt-1" max={todayDate()} value={f.periodTo} onChange={(e) => set({ periodTo: e.target.value })} />
            </div>
            <div>
              <Label>Excel (figures)</Label>
              <Input type="file" accept=".xls,.xlsx,.csv" className="mt-1" onChange={(e) => set({ excelName: e.target.files?.[0]?.name ?? "" })} />
            </div>
            <div>
              <Label>PDF (signed proof)</Label>
              <Input type="file" accept=".pdf" className="mt-1" onChange={(e) => set({ pdfName: e.target.files?.[0]?.name ?? "" })} />
            </div>
            <div className="sm:col-span-3">
              <Label>Items — one per line: service code, description, qty, uom, rate</Label>
              <Textarea className="mt-1 font-mono text-xs" rows={3} placeholder="3378150, APLY MPS1 HANDTOOL BRUSH, 681.765, M2, 169.78" value={f.items} onChange={(e) => set({ items: e.target.value })} />
            </div>
            <div>
              <Label>Invoice no. (when RIL has one)</Label>
              <Input className="mt-1" value={f.invoiceNo} onChange={(e) => set({ invoiceNo: e.target.value })} />
              <Button type="submit" className="mt-3 w-full">Upload</Button>
            </div>
          </form>
          <p className="mt-2 text-[11px] text-[var(--sge-ink-3)]">
            The same RIL JMS no. again updates that JMS (its status moves on and the change is logged). A new upload is linked to its internal JMS when exactly one fits (site, plant, service item, period); otherwise link it below. Only file names are kept until Supabase Storage is set up.
          </p>
        </Panel>
      ) : null}

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">Submitted JMS</h3>
        {subs.length === 0 ? (
          <EmptyState title="Nothing uploaded yet" detail="Admin uploads each JMS pack sent to RIL." />
        ) : (
          <div className="space-y-2">
            {subs.map((s) => {
              const j = s.jmsId ? work.jms.find((x) => x.id === s.jmsId) : undefined;
              const diffs = j ? compareJms(j, s, work) : [];
              const cands = j ? [] : linkCandidates(s, work);
              return (
                <div key={s.id} className="rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold">RIL {s.rilJmsNo}</span>
                      <StatusPill tone={s.status === "A1 REJECT" ? "crit" : s.status === "PAID" ? "ok" : "accent"}>{s.status}</StatusPill>
                      {j ? (
                        diffs.length ? <StatusPill tone="warn">differs from JMS {j.jmsNo}</StatusPill> : <StatusPill tone="ok">matches JMS {j.jmsNo}</StatusPill>
                      ) : (
                        <StatusPill>no internal JMS linked</StatusPill>
                      )}
                    </div>
                    <span className="font-mono text-xs">{s.qty} · {formatINR(s.amount)}</span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-[var(--sge-ink-3)]">
                    {siteCode(s.siteId)} · {s.plant} · {s.periodFrom} – {s.periodTo} · WO {s.woNo}
                    {s.invoiceNo ? ` · inv ${s.invoiceNo}` : ""} · {s.items.map((i) => i.serviceCode).join(", ")}
                    {s.files.excelName ? ` · ${s.files.excelName}` : ""}{s.files.pdfName ? ` · ${s.files.pdfName}` : ""}
                    {` · by ${s.uploadedBy} ${s.uploadedAt.slice(0, 10)}`}
                  </div>
                  {diffs.length ? (
                    <ul className="mt-1 text-[11px] text-[var(--sge-warn)]">
                      {diffs.map((d) => <li key={d.field}>{d.field}: ours {d.internal} · RIL {d.submitted}</li>)}
                    </ul>
                  ) : null}
                  {s.statusLog.length > 1 ? (
                    <div className="mt-1 text-[11px] text-[var(--sge-ink-3)]">
                      Status trail: {s.statusLog.map((l) => `${l.status} (${l.at.slice(0, 10)}, ${l.by})`).join(" → ")}
                    </div>
                  ) : null}
                  {canLink ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {j ? (
                        <Button size="sm" variant="ghost" onClick={() => { const r = unlinkSubmission(s.id); setMsg(r.ok ? { ok: true, text: "Unlinked." } : { ok: false, text: r.error }); }}>
                          Unlink
                        </Button>
                      ) : (
                        <>
                          <select className="h-8 rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-xs" value={linkPick[s.id] ?? ""} onChange={(e) => setLinkPick((x) => ({ ...x, [s.id]: e.target.value }))}>
                            <option value="">{cands.length ? "Link to internal JMS…" : "No matching internal JMS"}</option>
                            {cands.map((c) => <option key={c.id} value={c.id}>JMS {c.jmsNo} · {c.qty} m² · {c.periodFrom} – {c.periodTo}</option>)}
                          </select>
                          <Button size="sm" variant="outline" disabled={!linkPick[s.id]} onClick={() => { const r = linkSubmission(s.id, linkPick[s.id]); setMsg(r.ok ? { ok: true, text: "Linked — differences are shown on the row." } : { ok: false, text: r.error }); }}>
                            Link
                          </Button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">Internal JMS not submitted to RIL yet</h3>
        {notSubmitted.length === 0 ? (
          <p className="text-sm text-[var(--sge-ink-3)]">Every internal JMS has a submission.</p>
        ) : (
          <div className="space-y-1 font-mono text-xs">
            {notSubmitted.slice(0, 40).map((j) => {
              const line = lineOf(j.planLineId);
              return (
                <div key={j.id}>
                  JMS {j.jmsNo} · {siteCode(line?.siteId ?? "")} · {line?.plant} · {j.serviceCode} · {j.qty} m² · {formatINR(j.amount)} · confirmed {j.confirmedOn}
                </div>
              );
            })}
            {notSubmitted.length > 40 ? <div>… and {notSubmitted.length - 40} more</div> : null}
          </div>
        )}
      </Panel>

      <Panel>
        <h3 className="mb-1 font-heading text-sm font-bold">Supervisor ratings</h3>
        <p className="mb-3 text-[11px] text-[var(--sge-ink-3)]">
          Worked out each time from linked JMS: how close RIL&apos;s submitted quantity is to the internal JMS, less a point per two sent-back DPRs or jobs. Posting an incentive is the Owner&apos;s call.
        </p>
        {ratings.length === 0 ? (
          <EmptyState title="No ratings yet" detail="Ratings appear once internal JMS are linked to their RIL submissions." />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wide text-[var(--sge-ink-3)]">
              <tr>
                <th className="py-1">Supervisor</th>
                <th>JMS</th>
                <th className="text-right">Internal m²</th>
                <th className="text-right">RIL m²</th>
                <th className="text-right">Match</th>
                <th className="text-right">Sent back</th>
                <th className="text-right">Score</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ratings.map((r) => (
                <tr key={r.supervisorId} className="border-t border-[var(--sge-line)]">
                  <td className="py-1.5">{fullState.staff.find((x) => x.id === r.supervisorId)?.name ?? r.supervisorId}</td>
                  <td>{r.jmsCount}</td>
                  <td className="text-right font-mono">{r.internalQty}</td>
                  <td className="text-right font-mono">{r.submittedQty}</td>
                  <td className="text-right font-mono">{(r.ratio * 100).toFixed(1)}%</td>
                  <td className="text-right font-mono">{r.sentBack}</td>
                  <td className="text-right"><StatusPill tone={r.score >= 4 ? "ok" : r.score >= 3 ? "accent" : "warn"}>{r.score}/5</StatusPill></td>
                  <td className="text-right">
                    {canPost ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (!window.confirm(`Post a ${formatINR(r.suggestedIncentive)} incentive to the wage ledger?`)) return;
                          addWageEntry({ staffId: r.supervisorId, date: todayDate(), kind: "incentive", amount: r.suggestedIncentive, note: `JMS rating incentive · score ${r.score}/5`, flaggedToSic: false });
                          setMsg({ ok: true, text: "Incentive posted to the wage ledger." });
                        }}
                      >
                        Post {formatINR(r.suggestedIncentive)}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("jms", JmsPage);
