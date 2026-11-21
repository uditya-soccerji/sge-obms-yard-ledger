"use client";
/**
 * Home for a sub-contractor login (owner, 2026-11-21): like the SIC's view of his own people, but
 * view only. His supervisors (staff tagged with his sub-con), their crew and DPRs on his sites.
 * Anything to change goes to Owner / Super Admin as a request. The database only sends him his
 * own records (migration 015); the filters here keep the demo and the screen tidy too.
 */
import Link from "next/link";
import { useState } from "react";
import { EmptyState, Panel, SectionHeader, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { useWork } from "@/lib/work/store";
import { daysAgo } from "@/lib/today";
import { subconMaterial } from "@/lib/work/scaffold";

const TYPE: Record<string, string> = { painting_blasting: "Painting & blasting", scaffolding: "Scaffolding", rope_access: "Rope access", safety: "Safety" };
const STATUS: Record<string, string> = { draft: "Draft", submitted: "Submitted", sic_approved: "SIC approved", sic_rejected: "Sent back" };

export function SubconHome() {
  const { fullState: state, currentAccount, requestSubconChange } = useStore();
  const { work } = useWork();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const contractorId = currentAccount?.contractorId;
  const firm = state.masterCatalog.contractors.find((c) => c.id === contractorId)?.name ?? "Your sub-con";
  const sites = currentAccount?.siteIds ?? [];
  const mine = state.staff.filter((x) => x.contractorId && x.contractorId === contractorId && x.active !== false);
  const mineIds = new Set(mine.map((x) => x.id));
  const crewOf = (id: string) => state.labourers.filter((l) => l.supervisorId === id && l.active !== false).length;
  const since = daysAgo(7);
  const reports = work.reports
    // Drafts aren't finished; he sees what was submitted
    .filter((r) => r.status !== "draft" && mineIds.has(r.submitterId) && (!sites.length || sites.includes(r.siteId)))
    .sort((a, b) => b.date.localeCompare(a.date) || a.plant.localeCompare(b.plant));
  const requests = state.subconRequests.filter((r) => r.contractorId === contractorId);
  const name = (id: string) => state.staff.find((x) => x.id === id)?.name ?? id;
  const site = (id: string) => state.sites.find((x) => x.id === id)?.code ?? id;

  if (!contractorId) {
    return <EmptyState title="Not linked to a sub-con" detail="Ask the Owner or Super Admin to link this login to your firm in Master Data → Users / seats." />;
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title={firm}
        subtitle={`Sub-contractor · view only · ${sites.map(site).join(", ") || "no site"}. To change anything, send a request to the Owner / Super Admin below.`}
      />

      {(() => {
        // Owner, 2026-11-21: his scaffolding material — held, standing on his jobs, free
        const m = subconMaterial(contractorId, work.scaffoldMaterial ?? [], work.scaffoldJobs ?? [], work.reports);
        return m.issued ? (
          <Panel>
            <h3 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide">Scaffolding material</h3>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[["Issued", m.issued], ["Returned", m.returned], ["In use on jobs", m.inUse], ["Free", m.free]].map(([l, v]) => (
                <div key={String(l)} className="rounded-sm bg-[var(--sge-paper-2)] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">{l}</div>
                  <div className="font-heading text-xl font-semibold tabular-nums">{Number(v).toLocaleString("en-IN")} m³</div>
                </div>
              ))}
            </div>
          </Panel>
        ) : null;
      })()}

      <Panel>
        <h3 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide">My supervisors · {mine.length}</h3>
        {mine.length === 0 ? (
          <p className="text-sm text-[var(--sge-ink-3)]">No supervisors are tagged with {firm} yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2">
              <thead className="text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
                <tr><th>Name</th><th>Type</th><th>EP</th><th>Site</th><th className="text-right">Crew</th><th className="text-right">DPRs (7 days)</th></tr>
              </thead>
              <tbody>
                {mine.map((x) => (
                  <tr key={x.id} className="border-t border-[var(--sge-line)]">
                    <td className="font-semibold">{x.name}</td>
                    <td>{x.supervisorType ? TYPE[x.supervisorType] : "—"}</td>
                    <td className="font-mono text-xs">{x.epNumber ?? "—"}</td>
                    <td>{[x.siteId, ...(x.siteIds ?? [])].filter((v, i, a) => a.indexOf(v) === i).map(site).join(", ")}</td>
                    <td className="text-right tabular-nums">{crewOf(x.id)}</td>
                    <td className="text-right tabular-nums">{reports.filter((r) => r.submitterId === x.id && r.date >= since).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel>
        <h3 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide">Their DPRs</h3>
        {reports.length === 0 ? (
          <p className="text-sm text-[var(--sge-ink-3)]">No DPRs from your supervisors yet.</p>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[560px] text-sm [&_td]:px-3 [&_td]:py-1.5 [&_th]:px-3 [&_th]:py-2">
              <thead className="sticky top-0 bg-[var(--sge-paper)] text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
                <tr><th>Date</th><th>Supervisor</th><th>Plant</th><th className="text-right">Erected / removed m³</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {reports.slice(0, 200).map((r) => {
                  const er = (r.scaffoldWork ?? []).reduce((n, l) => n + (l.erectM3 || 0), 0);
                  const dm = (r.scaffoldWork ?? []).reduce((n, l) => n + (l.dismantleM3 || 0), 0);
                  return (
                    <tr key={r.id} className="border-t border-[var(--sge-line)]">
                      <td className="whitespace-nowrap">{r.date}</td>
                      <td>{name(r.submitterId)}</td>
                      <td>{r.plant || "—"}</td>
                      <td className="text-right tabular-nums">{r.scaffoldWork?.length ? `${er.toLocaleString("en-IN")} / ${dm.toLocaleString("en-IN")}` : "—"}</td>
                      <td><StatusPill tone={r.status === "sic_approved" ? "ok" : r.status === "sic_rejected" ? "crit" : "default"}>{STATUS[r.status] ?? r.status}</StatusPill></td>
                      <td className="text-right"><Link className="text-xs font-semibold text-[var(--sge-brass-ink)] underline" href={`/print/dpr/${r.id}`} target="_blank">View</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel>
        <h3 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide">Request a change</h3>
        <p className="mb-2 text-xs text-[var(--sge-ink-3)]">Your login can&apos;t add or change data. Write what needs doing (add a labourer, correct a DPR, move someone to another supervisor…) and the Owner / Super Admin will act on it.</p>
        <Textarea id="subcon-request" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Add Ramesh Kumar (EP PP59…) to Niraj's crew from 1 Dec" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              const r = requestSubconChange(text);
              setMsg(r.ok ? { ok: true, text: "Sent to the Owner / Super Admin." } : { ok: false, text: r.error ?? "Not sent" });
              if (r.ok) setText("");
            }}
          >
            Send request
          </Button>
          {msg ? <span className={`text-xs ${msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]"}`}>{msg.text}</span> : null}
        </div>
        {requests.length ? (
          <ul className="mt-3 divide-y divide-[var(--sge-line)] text-sm">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <span className="min-w-0">{r.text}<span className="block text-xs text-[var(--sge-ink-3)]">{r.requestedAt.slice(0, 10)}{r.decidedNote ? ` · ${r.decidedNote}` : ""}</span></span>
                <StatusPill tone={r.status === "done" ? "ok" : r.status === "declined" ? "crit" : "warn"}>{r.status === "pending" ? "Waiting" : r.status === "done" ? "Done" : "Declined"}</StatusPill>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </div>
  );
}

/** Owner / Super Admin: requests from sub-con logins waiting to be acted on */
export function SubconRequestsPanel() {
  const { fullState: state, decideSubconRequest } = useStore();
  const [why, setWhy] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  if (state.currentRole !== "owner" && state.currentRole !== "super_admin") return null;
  const waiting = state.subconRequests.filter((r) => r.status === "pending");
  if (!waiting.length) return null;
  const firm = (id: string) => state.masterCatalog.contractors.find((c) => c.id === id)?.name ?? id;
  return (
    <Panel>
      <h3 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide">Requests from sub-contractors · {waiting.length}</h3>
      <ul className="divide-y divide-[var(--sge-line)]">
        {waiting.map((r) => (
          <li key={r.id} className="flex flex-wrap items-end justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <div>{r.text}</div>
              <div className="text-xs text-[var(--sge-ink-3)]">{firm(r.contractorId)} · {r.requestedByName} · {r.requestedAt.slice(0, 10)}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label="Reason, if declining" className="h-8 w-48 rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-xs" placeholder="Reason, if declining" value={why[r.id] ?? ""} onChange={(e) => setWhy({ ...why, [r.id]: e.target.value })} />
              <Button size="sm" variant="ghost" onClick={() => { const x = decideSubconRequest(r.id, false, why[r.id]); setErr(x.ok ? null : x.error ?? "Not saved"); }}>Decline</Button>
              <Button size="sm" onClick={() => { const x = decideSubconRequest(r.id, true, why[r.id]); setErr(x.ok ? null : x.error ?? "Not saved"); }}>Mark done</Button>
            </div>
          </li>
        ))}
      </ul>
      {err ? <p className="mt-1 text-xs text-[var(--sge-crit)]">{err}</p> : null}
    </Panel>
  );
}
