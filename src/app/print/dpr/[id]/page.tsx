"use client";

import { useParams } from "next/navigation";
import { otHours, attendanceLabel } from "@/lib/attendance";
import { reasonLabel } from "@/lib/requests";
import { useStore } from "@/lib/store";
import { entryArea, round3 } from "@/lib/work/logic";
import { entriesOf } from "@/lib/work/reports";
import { useWork, WorkProvider } from "@/lib/work/store";

/**
 * A submitted DPR as a printable page — the supervisor saves it as PDF as proof of
 * submission (docs §24). Outside the app shell so only the report prints.
 */
function DprPrint() {
  const id = String(useParams().id);
  const { state, fullState, currentAccount } = useStore();
  const { work, hydrated } = useWork();
  const r = work.reports.find((x) => x.id === id);
  const role = state.currentRole;
  const mayRead = !!r && (r.submitterId === state.currentUserId || ["sic", "admin", "owner", "super_admin", "hr"].includes(role ?? ""));

  if (!hydrated) return <p className="p-8 text-sm">Loading…</p>;
  if (!currentAccount) return <p className="p-8 text-sm">Sign in first, then open the PDF again from the DPR.</p>;
  if (!r || !mayRead) return <p className="p-8 text-sm">This DPR isn&apos;t yours to print, or it doesn&apos;t exist.</p>;
  if (r.status === "draft") return <p className="p-8 text-sm">Submit the DPR first — the PDF is the proof of submission.</p>;

  const site = fullState.sites.find((s) => s.id === r.siteId);
  const who = fullState.staff.find((s) => s.id === r.submitterId);
  const lab = (lid: string) => fullState.labourers.find((l) => l.id === lid);
  const jobs = entriesOf(work, id);
  const jobOf = (jid: string) => work.jobs.find((j) => j.id === jid);
  const eq = (eid: string) => fullState.equipment.find((e) => e.id === eid);
  const totalArea = round3(jobs.reduce((n, e) => n + entryArea(e), 0));
  const totalLitres = round3(jobs.reduce((n, e) => n + (e.litres || 0), 0));
  const printed = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const submitted = r.submittedAt ? new Date(r.submittedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "—";
  const th = "border border-neutral-400 bg-neutral-100 px-1.5 py-1 text-left font-semibold";
  const td = "border border-neutral-400 px-1.5 py-1 align-top";

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
          <div>Daily Progress Report · RIL Jamnagar</div>
        </div>
        <div className="text-right">
          <div className="text-base font-bold">DPR {r.date}</div>
          <div>Ref {r.id}</div>
        </div>
      </header>

      <table className="mb-3 w-full border-collapse">
        <tbody>
          <tr>
            <td className={th}>Supervisor</td>
            <td className={td}>{who?.name ?? r.submitterId}{who?.designation ? ` · ${who.designation}` : ""}{who?.phone ? ` · ${who.phone}` : ""}</td>
            <td className={th}>Type</td>
            <td className={td}>{r.submitterType.replace("_", " & ")}</td>
          </tr>
          <tr>
            <td className={th}>Site · plant</td>
            <td className={td}>{site?.code ?? r.siteId} · {r.plant}</td>
            <td className={th}>Status</td>
            <td className={td}>{r.status.replace("_", " ")}</td>
          </tr>
          <tr>
            <td className={th}>Submitted</td>
            <td className={td}>{submitted}</td>
            <td className={th}>Permit · TBT</td>
            <td className={td}>{r.permitOk ? "Permit OK" : "—"} · {r.tbtDone ? "TBT done" : "—"}</td>
          </tr>
        </tbody>
      </table>

      {jobs.length ? (
        <section className="mb-3">
          <h2 className="mb-1 font-bold uppercase">Work done</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Job</th>
                <th className={th}>Location</th>
                <th className={th}>Stage</th>
                <th className={th}>Members</th>
                <th className={th}>m²</th>
                <th className={th}>Paint</th>
                <th className={th}>Litres</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((e) => (
                <tr key={e.id}>
                  <td className={td}>{jobOf(e.jobId)?.jobNo ?? e.jobId}</td>
                  <td className={td}>{jobOf(e.jobId)?.location ?? "—"}</td>
                  <td className={td}>{e.stage}</td>
                  <td className={td}>{e.members.map((m) => `${m.name} ${m.nos}×${m.side}×${m.length}×${m.cf}`).join("; ")}</td>
                  <td className={`${td} text-right`}>{entryArea(e)}</td>
                  <td className={td}>{e.paintSap ?? "—"}</td>
                  <td className={`${td} text-right`}>{e.litres || "—"}</td>
                </tr>
              ))}
              <tr>
                <td className={`${td} font-semibold`} colSpan={4}>Total</td>
                <td className={`${td} text-right font-semibold`}>{totalArea}</td>
                <td className={td} />
                <td className={`${td} text-right font-semibold`}>{totalLitres || "—"}</td>
              </tr>
            </tbody>
          </table>
        </section>
      ) : r.zeroReason ? (
        <p className="mb-3"><b>No quantity today:</b> {r.zeroReason}</p>
      ) : null}

      {(r.scaffoldWork ?? []).length ? (
        <section className="mb-3">
          <h2 className="mb-1 font-bold uppercase">Scaffolding work</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Plant</th>
                <th className={th}>Location</th>
                <th className={th}>Erect m³</th>
                <th className={th}>Dismantle m³</th>
                <th className={th}>Standing m³</th>
              </tr>
            </thead>
            <tbody>
              {(r.scaffoldWork ?? []).map((l) => (
                <tr key={l.id}>
                  <td className={td}>{l.plant}</td>
                  <td className={td}>{l.location}</td>
                  <td className={`${td} text-right`}>{l.erectM3}</td>
                  <td className={`${td} text-right`}>{l.dismantleM3}</td>
                  <td className={`${td} text-right`}>{l.standingM3}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="mb-3">
        <h2 className="mb-1 font-bold uppercase">Crew attendance ({r.labourMarks.length})</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>#</th>
              <th className={th}>Name</th>
              <th className={th}>EP</th>
              <th className={th}>Status</th>
              <th className={th}>In</th>
              <th className={th}>Out</th>
              <th className={th}>OT h</th>
            </tr>
          </thead>
          <tbody>
            {r.labourMarks.map((m, i) => (
              <tr key={m.labourerId}>
                <td className={td}>{i + 1}</td>
                <td className={td}>{lab(m.labourerId)?.name ?? m.labourerId}</td>
                <td className={td}>{lab(m.labourerId)?.epNumber ?? "—"}</td>
                <td className={td}>{attendanceLabel(m.status)}</td>
                <td className={td}>{m.inTime ?? "—"}</td>
                <td className={td}>{m.outTime ?? "—"}</td>
                <td className={`${td} text-right`}>{otHours(m.inTime, m.outTime) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {r.equipmentMarks.length ? (
        <section className="mb-3">
          <h2 className="mb-1 font-bold uppercase">Equipment &amp; material on crew</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Item</th>
                <th className={th}>Condition</th>
                <th className={th}>Expiry</th>
                <th className={th}>Note</th>
              </tr>
            </thead>
            <tbody>
              {r.equipmentMarks.map((m) => (
                <tr key={m.equipmentId}>
                  <td className={td}>{eq(m.equipmentId) ? `${eq(m.equipmentId)!.tag} · ${eq(m.equipmentId)!.type}` : m.equipmentId}</td>
                  <td className={td}>{m.status}</td>
                  <td className={td}>{m.expiryDate ?? "—"}</td>
                  <td className={td}>{m.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {r.requests.length ? (
        <section className="mb-3">
          <h2 className="mb-1 font-bold uppercase">Requests to the store</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Reason</th>
                <th className={th}>Kind</th>
                <th className={th}>What</th>
                <th className={th}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {r.requests.map((q) => (
                <tr key={q.id}>
                  <td className={td}>{reasonLabel(q.reason) || (q.urgent ? "Urgent" : "—")}</td>
                  <td className={td}>{q.kind}</td>
                  <td className={td}>{q.description}</td>
                  <td className={`${td} text-right`}>{q.qty ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="mb-3 grid gap-2">
        {r.issues?.trim() ? <p><b>Issues on site:</b> {r.issues}</p> : null}
        {r.note?.trim() ? <p><b>Note:</b> {r.note}</p> : null}
        {r.nextDayPlan?.trim() ? <p><b>Next-day plan:</b> {r.nextDayPlan}</p> : null}
        {r.sicReviewedBy ? (
          <p>
            <b>SIC review:</b> {r.status === "sic_approved" ? "approved" : "sent back"} by {r.sicReviewedBy}
            {r.sicNote ? ` — ${r.sicNote}` : ""}
          </p>
        ) : null}
      </section>

      <footer className="mt-6 flex justify-between border-t border-black pt-2 text-[10px]">
        <span>Proof of submission · submitted {submitted}</span>
        <span>Printed by {currentAccount.name || currentAccount.username} · {printed}</span>
      </footer>
    </div>
  );
}

export default function DprPrintPage() {
  return (
    <WorkProvider>
      <DprPrint />
    </WorkProvider>
  );
}
