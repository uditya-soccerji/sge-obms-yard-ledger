"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { estimateCost } from "@/lib/estimate";
import { areaFromDims, calculatePaint, scaffoldVolume } from "@/lib/paint-calc";
import { PAINT_SCHEMES, THINNER_PCT } from "@/lib/paint-schemes";
import type { AppMethod } from "@/lib/paint-types";
import { canViewModule } from "@/lib/permissions";
import { entrySiteId } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import type { RateCardKind } from "@/lib/types";

/** Who may print a calculation (docs §24) */
const CALC_ROLES = ["supervisor", "sic", "admin", "store", "safety", "owner", "super_admin"];

const n = (v: string | null, d = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};
const fmt = (x: number) => x.toLocaleString("en-IN", { maximumFractionDigits: 3 });
const inr = (x: number) => `₹${x.toLocaleString("en-IN")}`;

type Step = { label: string; working: string; result: string };

/**
 * A calculator's inputs, every step of the working and the result, with the
 * user's profile — printed / saved as PDF (docs §24). The inputs come in the URL
 * (numbers only); the calculation is redone here with the same functions.
 */
function CalcPrint() {
  const q = useSearchParams();
  const { state, fullState, currentAccount } = useStore();
  const type = q.get("type") ?? "";
  if (!currentAccount) return <p className="p-8 text-sm">Sign in first, then open the PDF again from the calculator.</p>;
  if (!CALC_ROLES.includes(state.currentRole ?? "") || !canViewModule(currentAccount, state.currentRole, "calculators")) {
    return <p className="p-8 text-sm">Your role can&apos;t use the calculators.</p>;
  }

  let title = "";
  const inputs: [string, string][] = [];
  const steps: Step[] = [];
  const results: [string, string][] = [];
  const notes: string[] = [];

  if (type === "area") {
    const l = n(q.get("l")), w = n(q.get("w")), f = n(q.get("f"), 1);
    const a = areaFromDims(l, w, f);
    title = "Area & scope";
    inputs.push(["Length", `${fmt(l)} m`], ["Width / height", `${fmt(w)} m`], ["Faces", fmt(f)]);
    steps.push({ label: "Area", working: `L × W × faces = ${fmt(l)} × ${fmt(w)} × ${fmt(f)}`, result: `${fmt(a)} m²` });
    results.push(["Scope area", `${fmt(a)} m²`]);
    notes.push("Negative or blank sizes count as 0. Rounded to 3 decimals.");
  } else if (type === "scaffold") {
    const l = n(q.get("l")), b = n(q.get("b")), h = n(q.get("h")), e = n(q.get("e"), 1);
    const v = scaffoldVolume(l, b, h, e);
    title = "Scaffolding volume";
    inputs.push(["L", `${fmt(l)} m`], ["B", `${fmt(b)} m`], ["H", `${fmt(h)} m`], ["E (factor)", fmt(e)]);
    steps.push({ label: "Standing volume", working: `L × B × H × E = ${fmt(l)} × ${fmt(b)} × ${fmt(h)} × ${fmt(e)}`, result: `${fmt(v)} m³` });
    results.push(["Standing volume", `${fmt(v)} m³`]);
    notes.push("Negative or blank sizes count as 0. Rounded to 3 decimals.");
  } else if (type === "paint") {
    const schemeId = n(q.get("scheme"), 2);
    const area = n(q.get("area"));
    const method = (q.get("method") === "spray" ? "spray" : "brush") as AppMethod;
    const cont = n(q.get("cont"));
    const manualLitres = q.get("manual") ? n(q.get("manual")) : undefined;
    const manualReason = q.get("reason") ?? "";
    const scheme = PAINT_SCHEMES.find((s) => s.id === schemeId);
    if (scheme) {
      const r = calculatePaint({ schemeId, area, method, contingencyPct: cont, manualLitres, manualReason });
      const k = 1 + cont / 100;
      title = `Paint calculator · MPS ${schemeId}`;
      inputs.push(["MPS scheme", `${schemeId} · ${scheme.status}`], ["Application", scheme.app], ["Area", `${fmt(area)} m²`], ["Method", method === "brush" ? "Brush / roller" : "Spray"], ["Contingency", `${fmt(cont)} %`], ["DFT", `${scheme.dft} µm`]);
      for (const c of r.coats) {
        const rate = method === "brush" ? c.coat.b : c.coat.sp;
        steps.push(
          c.litres != null
            ? { label: `${c.coat.pos} · ${c.coat.p} (SAP ${c.coat.sap || "—"})`, working: `${rate} L/m² × ${fmt(area)} m² × ${fmt(k)} = ${c.litres} L; thinner ${c.litres} × ${THINNER_PCT * 100}% = ${c.thinner} L`, result: `${c.litres} L + ${c.thinner} L` }
            : { label: `${c.coat.pos} · ${c.coat.p}`, working: `No published ${method} norm`, result: "—" }
        );
      }
      results.push(["Total paint", r.totalPaint != null ? `${r.totalPaint} L` : "—"], ["Total thinner", r.totalThinner != null ? `${r.totalThinner} L` : "—"]);
      if (r.isNoNorm) notes.push(`NO_NORM: manual litres ${manualLitres ?? "—"}${manualReason ? ` — reason: ${manualReason}` : ""} (flagged for the owner).`);
      if (r.partial) notes.push(`Part total: no ${method} norm for ${r.partial.join(", ")} — not in the total. Flagged for the owner.`);
      if (scheme.remarks) notes.push(scheme.remarks);
    }
  } else if (type === "estimate") {
    const kind = (["pipeline", "structures", "tanks", "scaffolding"].includes(q.get("kind") ?? "") ? q.get("kind") : "pipeline") as RateCardKind;
    const qty = n(q.get("qty"));
    const r = estimateCost(state.rateCards, { kind, quantity: qty, siteId: entrySiteId(state), rateLines: state.rateLines });
    const active = state.labourers.filter((l) => l.active && l.wageDaily > 0);
    const avg = active.length ? Math.round(active.reduce((s, l) => s + l.wageDaily, 0) / active.length) : 0;
    title = "Cost & manpower estimate";
    inputs.push(["Scope type", kind], ["Quantity", `${fmt(qty)} ${kind === "scaffolding" ? "m³" : "m²"}`]);
    if (r) {
      const unit = r.unit === "m3" ? "m³" : "m²";
      steps.push(
        { label: "Billing value (client rate)", working: `${fmt(qty)} ${unit} × ${inr(r.rateInr)}/${unit} (${r.fromRateBook ? "PO rate book" : "rate card"})`, result: inr(r.costInr) },
        { label: "Manpower", working: `${fmt(qty)} ${unit} × crew-days per ${unit}`, result: `${r.manpowerDays} crew-days` },
        { label: "Labour cost (est.)", working: `${r.manpowerDays} crew-days × average wage ${inr(avg)}`, result: inr(Math.round(r.manpowerDays * avg)) },
        kind === "scaffolding"
          ? { label: "Material", working: r.materialNote ?? "Scaffold hire", result: "—" }
          : { label: "Paint", working: `${fmt(qty)} ${unit} × litres per ${unit}`, result: `${r.paintLitres} L` }
      );
      results.push(["Billing value", inr(r.costInr)], ["Crew-days", String(r.manpowerDays)], ["Labour cost", inr(Math.round(r.manpowerDays * avg))]);
      notes.push("Billing value is what RIL pays at the client rate, not SGE's cost.");
    } else notes.push("No rate card for this scope type.");
  }

  if (!title) return <p className="p-8 text-sm">Open the PDF from a calculator.</p>;

  const staff = fullState.staff.find((s) => s.id === currentAccount.staffId || s.id === state.currentUserId);
  const site = fullState.sites.find((s) => s.id === entrySiteId(state));
  const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const ref = `CALC-${type.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
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
          <div>Calculation sheet · {title}</div>
        </div>
        <div className="text-right">
          <div className="font-bold">{when}</div>
          <div>Ref {ref}</div>
        </div>
      </header>

      <table className="mb-3 w-full border-collapse">
        <tbody>
          <tr>
            <td className={th}>Prepared by</td>
            <td className={td}>{currentAccount.name || currentAccount.username}{staff?.designation ? ` · ${staff.designation}` : ""}</td>
            <td className={th}>Role</td>
            <td className={td}>{(state.currentRole ?? "").replace("_", " ")}</td>
          </tr>
          <tr>
            <td className={th}>Staff ID</td>
            <td className={td}>{staff?.id ?? currentAccount.staffId ?? currentAccount.username}</td>
            <td className={th}>Phone</td>
            <td className={td}>{staff?.phone ?? "—"}</td>
          </tr>
          <tr>
            <td className={th}>Site</td>
            <td className={td}>{site ? `${site.code} · ${site.name}` : "All sites"}</td>
            <td className={th}>Login</td>
            <td className={td}>@{currentAccount.username}</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mb-1 font-bold uppercase">Inputs</h2>
      <table className="mb-3 w-full border-collapse">
        <tbody>
          {inputs.map(([k, v]) => (
            <tr key={k}>
              <td className={`${th} w-1/3`}>{k}</td>
              <td className={td}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-1 font-bold uppercase">Working</h2>
      <table className="mb-3 w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Step</th>
            <th className={th}>Working</th>
            <th className={th}>Result</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => (
            <tr key={i}>
              <td className={td}>{s.label}</td>
              <td className={`${td} font-mono text-[11px]`}>{s.working}</td>
              <td className={`${td} whitespace-nowrap text-right font-semibold`}>{s.result}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-1 font-bold uppercase">Result</h2>
      <table className="mb-3 w-full border-collapse">
        <tbody>
          {results.map(([k, v]) => (
            <tr key={k}>
              <td className={`${th} w-1/3`}>{k}</td>
              <td className={`${td} text-base font-bold`}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {notes.length ? (
        <ul className="mb-3 list-disc pl-5">
          {notes.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : null}

      <footer className="mt-6 flex justify-between border-t border-black pt-2 text-[10px]">
        <span>Calculated with the SGE Operations Hub norms in force on this date</span>
        <span>Signature: ____________________</span>
      </footer>
    </div>
  );
}

export default function CalcPrintPage() {
  return (
    <Suspense fallback={null}>
      <CalcPrint />
    </Suspense>
  );
}
