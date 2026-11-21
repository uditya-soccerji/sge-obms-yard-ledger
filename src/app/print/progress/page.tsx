"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { groupFacts } from "@/components/home/progress-dashboard";
import { buildFacts, matches, measure, planVsActual, punctuality, shows, spanDays, TYPE_FILTERS, type Filters, type TypeFilter } from "@/lib/progress";
import { worksAt } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import { today } from "@/lib/today";
import { useWork, WorkProvider } from "@/lib/work/store";

/**
 * Progress report as a printable page (owner, 2026-11-19): the same figures as Home → Progress for
 * the filters in the link. Owner / SA / SIC / Admin print any; a supervisor only their own.
 */
function ProgressPrint() {
  const q = useSearchParams();
  const { state, fullState, currentAccount } = useStore();
  const { work, hydrated } = useWork();
  const role = state.currentRole;
  if (!hydrated) return <p className="p-8 text-sm">Loading…</p>;
  if (!currentAccount) return <p className="p-8 text-sm">Sign in first, then open the report again from Home.</p>;
  const boss = ["owner", "super_admin", "sic", "admin"].includes(role ?? "");
  if (!boss && role !== "supervisor" && role !== "subcontractor") return <p className="p-8 text-sm">Your role doesn&apos;t have the progress report.</p>;

  const day = today();
  const f: Filters = {
    from: q.get("from") || day,
    to: q.get("to") || day,
    siteIds: (q.get("sites") || "").split(",").filter(Boolean),
    plant: q.get("plant") || "",
    supervisorId: boss ? q.get("sup") || "" : state.currentUserId ?? "",
    type: (q.get("type") as TypeFilter) || "all",
  };
  const supKind = (id: string) => {
    const t = fullState.staff.find((x) => x.id === id)?.supervisorType;
    return t === "scaffolding" ? "scaf" : t === "rope_access" ? "rope" : t === "painting_blasting" ? "pb" : null;
  };
  const S = shows(f.type === "all" && f.supervisorId && supKind(f.supervisorId) ? supKind(f.supervisorId)! : f.type);
  const typeOk = (id: string) => {
    const k = supKind(id) ?? "pb";
    return f.type === "all" || (f.type === "blast" || f.type === "paint" ? k !== "scaf" : k === f.type);
  };
  const supName = (id: string) => fullState.staff.find((x) => x.id === id)?.name ?? id;
  const facts = buildFacts(work, fullState.staff, f.from, f.to).filter((x) => matches(x, f));
  const m = measure(facts, f.type);
  const supervisors = fullState.staff
    .filter((x) => x.role === "supervisor" && x.active !== false && x.supervisorType !== "safety" && typeOk(x.id) && (!f.siteIds.length || worksAt(x, f.siteIds[0])) && fullState.labourers.some((l) => l.supervisorId === x.id && l.active !== false))
    .map((x) => ({ id: x.id, siteIds: x.siteIds?.length ? x.siteIds : [x.siteId] }));
  const punct = punctuality(work.reports, supervisors, f, day);
  const plan = planVsActual(work, f.to.slice(0, 7), f);
  const site = f.siteIds.length ? f.siteIds.map((id) => fullState.sites.find((x) => x.id === id)?.code ?? id).join(", ") : "All sites";
  const bySup = groupFacts(facts, "sup", f.from, f.to, supName);
  const byPlant = groupFacts(facts, "plant", f.from, f.to, supName);
  const byTime = groupFacts(facts, "time", f.from, f.to, supName);
  const n = (v: number) => Math.round(v).toLocaleString("en-IN");
  const th = "border border-neutral-400 bg-neutral-100 px-1.5 py-1 text-left font-semibold";
  const thn = `${th} text-right`;
  const td = "border border-neutral-400 px-1.5 py-1";
  const tdn = `${td} text-right tabular-nums`;
  const printed = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  const measureCols = (mm: ReturnType<typeof measure>) => (
    <>
      {S.blast ? <td className={tdn}>{n(mm.blast)}</td> : null}
      {S.paint ? <><td className={tdn}>{n(mm.coat)}</td><td className={tdn}>{n(mm.final)}</td></> : null}
      {S.scaf ? <><td className={tdn}>{n(mm.erect)}</td><td className={tdn}>{n(mm.dism)}</td></> : null}
      <td className={tdn}>{n(mm.mandays)}</td>
    </>
  );
  const measureHeads = (
    <>
      {S.blast ? <th className={thn}>Blasting m²</th> : null}
      {S.paint ? <><th className={thn}>Coats m²</th><th className={thn}>Final m²</th></> : null}
      {S.scaf ? <><th className={thn}>Erected m³</th><th className={thn}>Dismantled m³</th></> : null}
      <th className={thn}>Man-days</th>
    </>
  );

  return (
    <div className="mx-auto max-w-[800px] bg-white p-6 text-[12px] leading-snug text-black print:p-0">
      <style>{`@page { size: A4; margin: 12mm } @media print { .no-print { display: none !important } body { background: #fff !important } }`}</style>
      <div className="no-print mb-4 flex flex-wrap items-center gap-3 rounded border border-neutral-300 bg-neutral-50 p-3 text-sm">
        <span>Use <b>Save as PDF</b> as the printer to keep a copy.</span>
        <button type="button" className="ml-auto rounded bg-black px-3 py-1.5 font-semibold text-white" onClick={() => window.print()}>
          Download PDF
        </button>
      </div>

      <header className="mb-3 flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <div className="text-lg font-bold tracking-wide">SHREE GAYATRI ENTERPRISE</div>
          <div>Progress report · RIL Jamnagar</div>
          <div className="text-neutral-600">
            {site} · {f.plant || "All plants"} · {f.supervisorId ? supName(f.supervisorId) : "All supervisors"} · {TYPE_FILTERS.find((t) => t.id === f.type)?.label}
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-bold">{f.from === f.to ? f.from : `${f.from} → ${f.to}`}</div>
          <div>{spanDays(f.from, f.to)} day{spanDays(f.from, f.to) > 1 ? "s" : ""} · printed {printed}</div>
        </div>
      </header>

      <h2 className="mb-1 font-bold uppercase">Summary</h2>
      <table className="mb-3 w-full border-collapse">
        <tbody>
          {S.blast ? <tr><td className={td}>Blasting / surface prep</td><td className={tdn}>{n(m.blast)} m²</td></tr> : null}
          {S.paint ? <tr><td className={td}>Painting (1st / 2nd coat)</td><td className={tdn}>{n(m.coat)} m²</td></tr> : null}
          {S.paint ? <tr><td className={td}>Final shade (→ JMS)</td><td className={tdn}>{n(m.final)} m²</td></tr> : null}
          {S.paint ? <tr><td className={td}>Paint used</td><td className={tdn}>{n(m.litres)} L</td></tr> : null}
          {S.scaf ? <tr><td className={td}>Scaffold erected / dismantled</td><td className={tdn}>{n(m.erect)} / {n(m.dism)} m³</td></tr> : null}
          <tr><td className={td}>Man-days</td><td className={tdn}>{n(m.mandays)}</td></tr>
          <tr><td className={td}>DPRs</td><td className={tdn}>{punct.sent} sent · {punct.late} late · {punct.missing} not sent</td></tr>
          {m.ppe ? <tr><td className={td}>PPE flagged to the store</td><td className={tdn}>{m.ppe}</td></tr> : null}
        </tbody>
      </table>

      {!f.supervisorId ? (
        <>
          <h2 className="mb-1 font-bold uppercase">By supervisor</h2>
          <table className="mb-3 w-full border-collapse">
            <thead><tr><th className={th}>Supervisor</th>{measureHeads}<th className={thn}>DPRs sent / late / missing</th></tr></thead>
            <tbody>
              {bySup.map((g) => {
                const p = punct.bySupervisor.get(g.key);
                return <tr key={g.key}><td className={td}>{g.label}</td>{measureCols(measure(g.facts, f.type))}<td className={tdn}>{p ? `${p.sent} / ${p.late} / ${p.missing}` : "—"}</td></tr>;
              })}
            </tbody>
          </table>
        </>
      ) : null}

      <h2 className="mb-1 font-bold uppercase">By plant</h2>
      <table className="mb-3 w-full border-collapse">
        <thead><tr><th className={th}>Plant</th>{measureHeads}</tr></thead>
        <tbody>{byPlant.map((g) => <tr key={g.key}><td className={td}>{g.label}</td>{measureCols(measure(g.facts, f.type))}</tr>)}</tbody>
      </table>

      <h2 className="mb-1 font-bold uppercase">{spanDays(f.from, f.to) <= 16 ? "By day" : "By week (from Monday)"}</h2>
      <table className="mb-3 w-full border-collapse">
        <thead><tr><th className={th}>{spanDays(f.from, f.to) <= 16 ? "Day" : "Week of"}</th>{measureHeads}</tr></thead>
        <tbody>{byTime.map((g) => <tr key={g.key}><td className={td}>{g.label}</td>{measureCols(measure(g.facts, f.type))}</tr>)}</tbody>
      </table>

      {plan.length ? (
        <>
          <h2 className="mb-1 font-bold uppercase">Plan vs actual · {f.to.slice(0, 7)}</h2>
          <table className="mb-3 w-full border-collapse">
            <thead><tr><th className={th}>Supervisor</th><th className={thn}>Plan m²</th><th className={thn}>Actual m²</th><th className={thn}>Of which JMS</th><th className={thn}>Remaining</th></tr></thead>
            <tbody>{plan.map((r) => <tr key={r.supervisorId}><td className={td}>{supName(r.supervisorId)}</td><td className={tdn}>{n(r.plan)}</td><td className={tdn}>{n(r.actual)}</td><td className={tdn}>{n(r.fromJms)}</td><td className={tdn}>{n(Math.max(0, r.plan - r.actual))}</td></tr>)}</tbody>
          </table>
          <p className="text-neutral-600">Actual is the JMS m² where the job has a JMS, otherwise final-shade m² from DPRs.</p>
        </>
      ) : null}
      {!facts.length ? <p className="mt-4 text-neutral-600">No submitted DPRs match these filters.</p> : null}
    </div>
  );
}

export default function ProgressPrintPage() {
  return (
    <WorkProvider>
      <Suspense fallback={<p className="p-8 text-sm">Loading…</p>}>
        <ProgressPrint />
      </Suspense>
    </WorkProvider>
  );
}
