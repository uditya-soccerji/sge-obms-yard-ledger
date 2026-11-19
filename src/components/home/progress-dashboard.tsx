"use client";
/**
 * Home → Progress (owner, 2026-11-19): a general view of the site and a detailed view for one
 * supervisor, plant or job type, by day / week / 15 days / month or chosen dates, with the report
 * (Excel and print) for whatever the filters show. A supervisor sees only their own figures.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { downloadXlsx } from "@/lib/excel-io";
import {
  addDays, buckets, buildFacts, KIND_LABEL, matches, measure, planVsActual, previousRange, punctuality, shows, spanDays,
  TYPE_FILTERS, weekStart, type Fact, type Filters, type JobKind, type Measures, type TypeFilter,
} from "@/lib/progress";
import { isAllSites, worksAt } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import { today } from "@/lib/today";
import { useWork } from "@/lib/work/store";
import { cn } from "@/lib/utils";

type Period = "day" | "week" | "fortnight" | "month" | "custom";
type Group = "sup" | "plant" | "type" | "time";

const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");
const sel = "h-8 rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-xs";

export function progressQuery(f: Filters) {
  const q = new URLSearchParams({ from: f.from, to: f.to });
  if (f.plant) q.set("plant", f.plant);
  if (f.supervisorId) q.set("sup", f.supervisorId);
  if (f.type !== "all") q.set("type", f.type);
  if (f.siteIds.length) q.set("sites", f.siteIds.join(","));
  return q.toString();
}

export function ProgressDashboard() {
  const { state, fullState } = useStore();
  const { work } = useWork();
  const role = state.currentRole;
  const own = role === "supervisor" ? state.currentUserId ?? "" : "";
  const day = today();
  const [period, setPeriod] = useState<Period>("fortnight");
  const [from15, setFrom15] = useState(addDays(day, -14));
  const [custom, setCustom] = useState<[string, string]>([addDays(day, -29), day]);
  const [plant, setPlant] = useState("");
  const [sup, setSup] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [group, setGroup] = useState<Group>(own ? "time" : "sup");
  const [open, setOpen] = useState(true);

  const siteIds = isAllSites(state) ? [] : [state.currentSiteId];
  const [from, to] = useMemo((): [string, string] => {
    if (period === "day") return [day, day];
    if (period === "week") return [weekStart(day), day];
    if (period === "month") return [`${day.slice(0, 7)}-01`, day];
    if (period === "fortnight") return [from15, addDays(from15, 14)];
    return custom[0] <= custom[1] ? custom : [custom[1], custom[0]];
  }, [period, day, from15, custom]);
  const filters: Filters = { from, to, siteIds, plant, supervisorId: own || sup, type };
  const [pFrom, pTo] = previousRange(from, to);

  const facts = useMemo(() => buildFacts(work, fullState.staff, pFrom, to), [work, fullState.staff, pFrom, to]);
  const inRange = (f: Fact, a: string, b: string) => f.date >= a && f.date <= b;
  const cur = facts.filter((f) => inRange(f, from, to) && matches(f, filters));
  const prev = facts.filter((f) => inRange(f, pFrom, pTo) && matches(f, filters));
  const m = measure(cur, type);
  const pm = measure(prev, type);
  // One supervisor picked with "All work": show only their kind of work (no empty scaffold tiles for a painter)
  const supKind = (id: string): JobKind | null => {
    const t = fullState.staff.find((x) => x.id === id)?.supervisorType;
    return t === "scaffolding" ? "scaf" : t === "rope_access" ? "rope" : t === "painting_blasting" ? "pb" : null;
  };
  const picked = own || sup;
  const S = shows(type === "all" && picked && supKind(picked) ? supKind(picked)! : type);

  const plants = siteIds.length
    ? fullState.sites.find((x) => x.id === siteIds[0])?.plants ?? []
    : [...new Set(fullState.sites.filter((x) => x.enabled).flatMap((x) => x.plants))].sort();
  const supervisors = fullState.staff.filter(
    (x) => x.role === "supervisor" && x.active !== false && x.supervisorType !== "safety" && (!siteIds.length || worksAt(x, siteIds[0]))
  );
  // DPRs expected from supervisors with a crew, of the job type picked
  const typeOk = (id: string) => {
    const k = supKind(id) ?? "pb";
    return type === "all" || (type === "blast" || type === "paint" ? k !== "scaf" : k === type);
  };
  const withCrew = supervisors
    .filter((x) => typeOk(x.id) && fullState.labourers.some((l) => l.supervisorId === x.id && l.active !== false))
    .map((x) => ({ id: x.id, siteIds: x.siteIds?.length ? x.siteIds : [x.siteId] }));
  const punct = punctuality(work.reports, withCrew, filters, day);
  const supName = (id: string) => fullState.staff.find((x) => x.id === id)?.name ?? id;
  const plan = planVsActual(work, to.slice(0, 7), filters);

  const tiles: [string, string, number, number][] = [];
  if (S.blast) tiles.push(["--sge-steel", "Blasting m²", m.blast, pm.blast]);
  if (S.paint) tiles.push(["--sge-brass", "Painting m² (coats)", m.coat, pm.coat], ["--sge-ok", "Final shade m² (→ JMS)", m.final, pm.final]);
  if (S.scaf) tiles.push(["--sge-steel", "Scaffold erected m³", m.erect, pm.erect], ["--sge-steel", "Scaffold dismantled m³", m.dism, pm.dism]);
  tiles.push(["--sge-ink-3", "Man-days", m.mandays, pm.mandays]);
  if (S.paint) tiles.push(["--sge-brass", "Paint used (L)", m.litres, pm.litres]);
  const expected = punct.sent + punct.missing;
  const onTime = expected ? ((punct.sent - punct.late) / expected) * 100 : null;

  const reportArgs = { filters, facts: cur, m, punct, plan, supName, siteName: siteIds.length ? fullState.sites.find((x) => x.id === siteIds[0])?.code ?? "" : "All sites" };

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="font-heading text-sm font-bold uppercase tracking-wide" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className={cn("mr-1 inline-block transition-transform", open && "rotate-90")}>›</span>
          Progress {own ? "· my work" : ""}
        </button>
        <span className="text-xs text-[var(--sge-ink-3)]">
          {from === to ? from : `${from} to ${to}`} · {reportArgs.siteName} · from submitted DPRs
        </span>
      </div>
      {open ? (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3 rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper-2)] p-2">
            <div role="group" aria-label="Period" className="inline-flex flex-wrap overflow-hidden rounded-md border border-[var(--sge-line)]">
              {([["day", "Today"], ["week", "This week"], ["fortnight", "15 days"], ["month", "This month"], ["custom", "Dates…"]] as [Period, string][]).map(([p, l]) => (
                <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className={cn("border-r border-[var(--sge-line)] px-2.5 py-1.5 text-xs font-semibold last:border-r-0", period === p ? "bg-[var(--sge-night)] text-[var(--sge-brass-wash)]" : "bg-[var(--sge-paper)] text-[var(--sge-ink-2)]")}>
                  {l}
                </button>
              ))}
            </div>
            {period === "fortnight" ? (
              <label className="flex items-center gap-1 text-xs text-[var(--sge-ink-2)]">
                From <input type="date" aria-label="15 days from" className={sel} value={from15} onChange={(e) => e.target.value && setFrom15(e.target.value)} />
                <span>to {addDays(from15, 14)}</span>
              </label>
            ) : null}
            {period === "custom" ? (
              <span className="flex items-center gap-1 text-xs text-[var(--sge-ink-2)]">
                <input type="date" aria-label="From" className={sel} value={custom[0]} onChange={(e) => e.target.value && setCustom([e.target.value, custom[1]])} /> to
                <input type="date" aria-label="To" className={sel} value={custom[1]} onChange={(e) => e.target.value && setCustom([custom[0], e.target.value])} />
              </span>
            ) : null}
            <select aria-label="Plant" className={sel} value={plant} onChange={(e) => setPlant(e.target.value)}>
              <option value="">All plants</option>
              {plants.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {!own ? (
              <select aria-label="Supervisor" className={sel} value={sup} onChange={(e) => setSup(e.target.value)}>
                <option value="">All supervisors</option>
                {supervisors.map((x) => <option key={x.id} value={x.id}>{x.name}{x.supervisorType ? ` · ${KIND_LABEL[x.supervisorType === "scaffolding" ? "scaf" : x.supervisorType === "rope_access" ? "rope" : "pb"]}` : ""}</option>)}
              </select>
            ) : null}
            <div role="group" aria-label="Job type" className="flex flex-wrap gap-1">
              {TYPE_FILTERS.map((t) => (
                <button key={t.id} type="button" aria-pressed={type === t.id} onClick={() => setType(t.id)} className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", type === t.id ? "border-[var(--sge-brass)] bg-[var(--sge-brass-wash)] text-[var(--sge-brass-ink)]" : "border-[var(--sge-line)] bg-[var(--sge-paper)] text-[var(--sge-ink-2)]")}>
                  {t.label}
                </button>
              ))}
            </div>
            {plant || sup || type !== "all" ? (
              <button type="button" className="text-xs font-semibold text-[var(--sge-brass-ink)] underline" onClick={() => { setPlant(""); setSup(""); setType("all"); }}>
                Back to general view
              </button>
            ) : null}
          </div>

          {/* Tiles */}
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {tiles.map(([c, label, v, p]) => (
              <div key={label} className="rounded-sm border border-[var(--sge-line)] border-t-[3px] bg-[var(--sge-paper)] px-3 py-2" style={{ borderTopColor: `var(${c})` }}>
                <div className="text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">{label}</div>
                <div className="font-heading text-2xl font-semibold tabular-nums">{fmt(v)}</div>
                <Delta now={v} before={p} />
              </div>
            ))}
            <div className="rounded-sm border border-[var(--sge-line)] border-t-[3px] bg-[var(--sge-paper)] px-3 py-2" style={{ borderTopColor: `var(${onTime == null ? "--sge-line" : onTime >= 90 ? "--sge-ok" : onTime >= 75 ? "--sge-warn" : "--sge-crit"})` }}>
              <div className="text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">DPRs on time</div>
              <div className="font-heading text-2xl font-semibold tabular-nums">{onTime == null ? "—" : `${onTime.toFixed(0)}%`}</div>
              <div className="text-xs text-[var(--sge-ink-2)]">{punct.late} late · {punct.missing} not sent</div>
            </div>
            {m.ppe ? (
              <div className="rounded-sm border border-[var(--sge-line)] border-t-[3px] border-t-[var(--sge-crit)] bg-[var(--sge-paper)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">PPE flagged</div>
                <div className="font-heading text-2xl font-semibold tabular-nums">{m.ppe}</div>
                <div className="text-xs text-[var(--sge-ink-2)]">sent to the store</div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <WorkChart facts={cur} from={from} to={to} type={type} />
            <PlanTable rows={plan} supName={supName} month={to.slice(0, 7)} />
          </div>

          <Breakdown
            facts={cur}
            from={from}
            to={to}
            type={type}
            group={group}
            setGroup={setGroup}
            own={!!own}
            punct={punct}
            supName={supName}
            onPick={(g, k) => {
              if (g === "sup") setSup(k);
              else if (g === "plant") setPlant(k);
              else if (g === "type") setType(k as JobKind);
              else {
                setPeriod("custom");
                setCustom(spanDays(from, to) <= 16 ? [k, k] : [k, addDays(k, 6)]);
              }
            }}
          />

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--sge-line)] pt-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">Report for these filters</span>
            <Button size="sm" onClick={() => downloadProgressExcel(reportArgs, work, fullState)}>Download Excel</Button>
            <Link className="text-xs font-semibold text-[var(--sge-brass-ink)] underline" href={`/print/progress?${progressQuery(filters)}`} target="_blank">
              Print / PDF
            </Link>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return <div className="text-xs text-[var(--sge-ink-3)]">{now ? "nothing before" : " "}</div>;
  const p = ((now - before) / before) * 100;
  return <div className={cn("text-xs", p >= 0 ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{p >= 0 ? "▲" : "▼"} {Math.abs(p).toFixed(0)}% vs before</div>;
}

function WorkChart({ facts, from, to, type }: { facts: Fact[]; from: string; to: string; type: TypeFilter }) {
  const B = buckets(from, to);
  const S = shows(type);
  const scafOnly = type === "scaf";
  const series: [keyof Measures, string, string][] = scafOnly
    ? [["erect", "--sge-steel", "Erected m³"], ["dism", "--sge-ink-3", "Dismantled m³"]]
    : [...(S.blast ? [["blast", "--sge-steel", "Blasting m²"] as [keyof Measures, string, string]] : []), ...(S.paint ? [["coat", "--sge-brass", "Coats m²"], ["final", "--sge-ok", "Final shade m²"]] as [keyof Measures, string, string][] : [])];
  const line = type === "all";
  const vals = B.map((b) => measure(facts.filter((f) => f.date >= b.from && f.date <= b.to), type));
  const W = 720, H = 240, L = 50, R = line ? 46 : 12, T = 10, Bm = 26, iw = W - L - R, ih = H - T - Bm;
  const nice = (x: number) => { const p = 10 ** Math.floor(Math.log10(x)); const f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
  const top = nice(Math.max(1, ...vals.map((v) => series.reduce((a, [k]) => a + v[k], 0))));
  const top2 = nice(Math.max(1, ...vals.map((v) => v.erect)));
  const bw = iw / Math.max(1, B.length);
  const empty = vals.every((v) => series.every(([k]) => !v[k]) && !v.erect);
  return (
    <div className="min-w-0 rounded-sm border border-[var(--sge-line)] p-3">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">{spanDays(from, to) <= 16 ? "Work done per day" : "Work done per week"}</div>
        <div className="flex flex-wrap gap-3 text-xs text-[var(--sge-ink-2)]">
          {series.map(([, c, l]) => <span key={l}><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-[-1px]" style={{ background: `var(${c})` }} />{l}</span>)}
          {line ? <span><i className="mr-1 inline-block h-0.5 w-3 align-middle" style={{ background: "var(--sge-ink-2)" }} />Scaffold m³ (right)</span> : null}
        </div>
      </div>
      {empty ? (
        <p className="py-10 text-center text-sm text-[var(--sge-ink-3)]">No work in submitted DPRs for these filters yet.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Work done chart">
          {[0, 1, 2, 3, 4].map((i) => {
            const y = T + ih - (ih * i) / 4;
            return (
              <g key={i}>
                <line x1={L} x2={W - R} y1={y} y2={y} stroke="var(--sge-line)" />
                <text x={L - 6} y={y + 4} textAnchor="end" fontSize="11" fill="var(--sge-ink-3)">{fmt((top * i) / 4)}</text>
                {line ? <text x={W - R + 6} y={y + 4} fontSize="11" fill="var(--sge-ink-3)">{fmt((top2 * i) / 4)}</text> : null}
              </g>
            );
          })}
          {B.map((b, i) => {
            let y = T + ih;
            const x = L + i * bw + bw * 0.18, w = bw * 0.64;
            return (
              <g key={b.key}>
                {series.map(([k, c]) => {
                  const h = (ih * vals[i][k]) / top;
                  y -= h;
                  return <rect key={k} x={x} y={y} width={w} height={Math.max(0, h)} fill={`var(${c})`}><title>{`${b.from === b.to ? b.from : `${b.from} – ${b.to}`}: ${fmt(vals[i][k])}`}</title></rect>;
                })}
                {B.length <= 16 || i % 2 === 0 ? <text x={L + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--sge-ink-3)">{b.label}</text> : null}
              </g>
            );
          })}
          {line ? (
            <path
              d={B.map((_, i) => `${i ? "L" : "M"}${(L + i * bw + bw / 2).toFixed(1)} ${(T + ih - (ih * vals[i].erect) / top2).toFixed(1)}`).join(" ")}
              fill="none"
              stroke="var(--sge-ink-2)"
              strokeWidth={2}
            />
          ) : null}
        </svg>
      )}
    </div>
  );
}

function PlanTable({ rows, supName, month }: { rows: ReturnType<typeof planVsActual>; supName: (id: string) => string; month: string }) {
  return (
    <div className="min-w-0 rounded-sm border border-[var(--sge-line)] p-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">Plan vs actual · {month}</div>
      {rows.length === 0 ? (
        <p className="py-6 text-sm text-[var(--sge-ink-3)]">No plan lines for these filters. Plan lines are for painting work (m²).</p>
      ) : (
        <table className="w-full text-sm [&_td]:py-1.5 [&_th]:py-1.5">
          <thead className="text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
            <tr><th className="text-left">Supervisor</th><th className="text-right">Plan m²</th><th className="text-right">Actual m²</th><th className="pl-3 text-left">Done</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = r.plan ? Math.min(100, (r.actual / r.plan) * 100) : 0;
              return (
                <tr key={r.supervisorId} className="border-t border-[var(--sge-line)]">
                  <td>{supName(r.supervisorId)}</td>
                  <td className="text-right tabular-nums">{fmt(r.plan)}</td>
                  <td className="text-right tabular-nums" title={r.fromJms ? `${fmt(r.fromJms)} m² from JMS` : "From DPRs (no JMS yet)"}>{fmt(r.actual)}</td>
                  <td className="whitespace-nowrap pl-3">
                    <span className="mr-1.5 inline-block h-1.5 w-16 overflow-hidden rounded bg-[var(--sge-paper-2)] align-middle"><i className="block h-full" style={{ width: `${p}%`, background: `var(${p >= 60 ? "--sge-ok" : p >= 35 ? "--sge-warn" : "--sge-crit"})` }} /></span>
                    {p.toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-xs text-[var(--sge-ink-3)]">Actual is the JMS m² where the job has a JMS, otherwise final-shade m² from DPRs.</p>
    </div>
  );
}

function Breakdown({
  facts, from, to, type, group, setGroup, own, punct, supName, onPick,
}: {
  facts: Fact[]; from: string; to: string; type: TypeFilter; group: Group; setGroup: (g: Group) => void; own: boolean;
  punct: ReturnType<typeof punctuality>; supName: (id: string) => string; onPick: (g: Group, key: string) => void;
}) {
  const rows = groupFacts(facts, group, from, to, supName);
  const S = shows(type);
  const cols: [string, (m: Measures) => number][] = [];
  if (S.blast) cols.push(["Blasting m²", (m) => m.blast]);
  if (S.paint) cols.push(["Coats m²", (m) => m.coat], ["Final m²", (m) => m.final]);
  if (S.scaf) cols.push(["Erected m³", (m) => m.erect], ["Dismantled m³", (m) => m.dism]);
  cols.push(["Man-days", (m) => m.mandays]);
  // Output per man-day: m² for painting work, m³ for scaffolding (a row with only scaffold work shows m³)
  const prod = (m: Measures) => {
    if (!m.mandays) return "—";
    const m2 = type === "scaf" ? 0 : m.blast + m.coat;
    return m2 ? `${(m2 / m.mandays).toFixed(1)} m²` : m.erect ? `${(m.erect / m.mandays).toFixed(1)} m³` : "—";
  };
  const groups: [Group, string][] = own ? [["time", "Day / week"], ["plant", "Plant"]] : [["sup", "Supervisor"], ["plant", "Plant"], ["type", "Job type"], ["time", "Day / week"]];
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">Breakdown</div>
        <div role="group" aria-label="Break down by" className="inline-flex overflow-hidden rounded-md border border-[var(--sge-line)]">
          {groups.map(([g, l]) => (
            <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)} className={cn("border-r border-[var(--sge-line)] px-2.5 py-1 text-xs font-semibold last:border-r-0", group === g ? "bg-[var(--sge-night)] text-[var(--sge-brass-wash)]" : "bg-[var(--sge-paper)] text-[var(--sge-ink-2)]")}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-sm text-[var(--sge-ink-3)]">No submitted DPRs match these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2">
            <thead className="text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
              <tr>
                <th className="text-left">{({ sup: "Supervisor", plant: "Plant", type: "Job type", time: spanDays(from, to) <= 16 ? "Day" : "Week of" } as Record<Group, string>)[group]}</th>
                {cols.map(([l]) => <th key={l} className="text-right">{l}</th>)}
                <th className="text-right">Per man-day</th>
                {group === "sup" ? <th className="text-left">DPRs</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const m = measure(r.facts, type);
                const p = group === "sup" ? punct.bySupervisor.get(r.key) : undefined;
                return (
                  <tr key={r.key} tabIndex={0} className="cursor-pointer border-t border-[var(--sge-line)] hover:bg-[var(--sge-paper-2)]" onClick={() => onPick(group, r.key)} onKeyDown={(e) => { if (e.key === "Enter") onPick(group, r.key); }}>
                    <td className="font-semibold">{r.label}</td>
                    {cols.map(([l, f]) => <td key={l} className="text-right tabular-nums">{fmt(f(m))}</td>)}
                    <td className="text-right tabular-nums">{prod(m)}</td>
                    {group === "sup" ? (
                      <td>{p ? <StatusPill tone={p.missing ? "crit" : p.late ? "warn" : "ok"}>{p.sent}/{p.sent + p.missing}{p.late ? ` · ${p.late} late` : ""}{p.missing ? ` · ${p.missing} missing` : ""}</StatusPill> : "—"}</td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-1 text-xs text-[var(--sge-ink-3)]">Click a row for the detailed view.</p>
    </div>
  );
}

export function groupFacts(facts: Fact[], group: Group, from: string, to: string, supName: (id: string) => string) {
  if (group === "time") {
    const short = spanDays(from, to) <= 16;
    return buckets(from, to).map((b) => ({ key: b.key, label: short ? b.from : `${b.key}`, facts: facts.filter((f) => f.date >= b.from && f.date <= b.to) })).filter((g) => g.facts.length);
  }
  const keyOf = (f: Fact) => (group === "sup" ? f.supervisorId : group === "plant" ? f.plant || "—" : f.kind);
  const map = new Map<string, Fact[]>();
  for (const f of facts) map.set(keyOf(f), [...(map.get(keyOf(f)) ?? []), f]);
  return [...map]
    .map(([key, fs]) => ({ key, label: group === "sup" ? supName(key) : group === "type" ? KIND_LABEL[key as JobKind] : key, facts: fs }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/* ---------- Excel ---------- */

type ReportArgs = {
  filters: Filters;
  facts: Fact[];
  m: Measures;
  punct: ReturnType<typeof punctuality>;
  plan: ReturnType<typeof planVsActual>;
  supName: (id: string) => string;
  siteName: string;
};

export function downloadProgressExcel(a: ReportArgs, work: ReturnType<typeof useWork>["work"], fullState: ReturnType<typeof useStore>["fullState"]) {
  const f = a.filters;
  const S = shows(f.type);
  const summary: Record<string, string | number>[] = [
    { Item: "Site", Value: a.siteName },
    { Item: "From", Value: f.from },
    { Item: "To", Value: f.to },
    { Item: "Plant", Value: f.plant || "All" },
    { Item: "Supervisor", Value: f.supervisorId ? a.supName(f.supervisorId) : "All" },
    { Item: "Job type", Value: TYPE_FILTERS.find((t) => t.id === f.type)?.label ?? f.type },
    ...(S.blast ? [{ Item: "Blasting m²", Value: Math.round(a.m.blast) }] : []),
    ...(S.paint ? [{ Item: "Painting m² (coats)", Value: Math.round(a.m.coat) }, { Item: "Final shade m²", Value: Math.round(a.m.final) }, { Item: "Paint used (L)", Value: Math.round(a.m.litres) }] : []),
    ...(S.scaf ? [{ Item: "Scaffold erected m³", Value: Math.round(a.m.erect) }, { Item: "Scaffold dismantled m³", Value: Math.round(a.m.dism) }] : []),
    { Item: "Man-days", Value: a.m.mandays },
    { Item: "DPRs sent", Value: a.punct.sent },
    { Item: "DPRs late", Value: a.punct.late },
    { Item: "DPRs not sent", Value: a.punct.missing },
    { Item: "PPE flagged", Value: a.m.ppe },
  ];
  const bySup = groupFacts(a.facts, "sup", f.from, f.to, a.supName).map((g) => {
    const m = measure(g.facts, f.type);
    const p = a.punct.bySupervisor.get(g.key);
    return { Supervisor: g.label, "Blasting m²": Math.round(m.blast), "Coats m²": Math.round(m.coat), "Final m²": Math.round(m.final), "Erected m³": Math.round(m.erect), "Dismantled m³": Math.round(m.dism), "Man-days": m.mandays, "Paint L": Math.round(m.litres), "DPRs sent": p?.sent ?? 0, Late: p?.late ?? 0, "Not sent": p?.missing ?? 0 };
  });
  const byPlant = groupFacts(a.facts, "plant", f.from, f.to, a.supName).map((g) => {
    const m = measure(g.facts, f.type);
    return { Plant: g.label, "Blasting m²": Math.round(m.blast), "Coats m²": Math.round(m.coat), "Final m²": Math.round(m.final), "Erected m³": Math.round(m.erect), "Man-days": m.mandays };
  });
  const byDay = groupFacts(a.facts, "time", f.from, f.to, a.supName).map((g) => {
    const m = measure(g.facts, f.type);
    return { [spanDays(f.from, f.to) <= 16 ? "Day" : "Week of"]: g.label, "Blasting m²": Math.round(m.blast), "Coats m²": Math.round(m.coat), "Final m²": Math.round(m.final), "Erected m³": Math.round(m.erect), "Man-days": m.mandays };
  });
  const plan = a.plan.map((r) => ({ Supervisor: a.supName(r.supervisorId), "Plan m²": Math.round(r.plan), "Actual m²": Math.round(r.actual), "Of which JMS m²": Math.round(r.fromJms), "Remaining m²": Math.max(0, Math.round(r.plan - r.actual)) }));
  const site = (id: string) => fullState.sites.find((x) => x.id === id)?.code ?? id;
  const reports = work.reports
    .filter((r) => r.date >= f.from && r.date <= f.to && (!f.siteIds.length || f.siteIds.includes(r.siteId)) && (!f.supervisorId || r.submitterId === f.supervisorId) && (!f.plant || r.plant.toUpperCase() === f.plant.toUpperCase()))
    .map((r) => ({ Date: r.date, Site: site(r.siteId), Plant: r.plant, Supervisor: a.supName(r.submitterId), Type: r.submitterType, Status: r.status, "Sent at": r.submittedAt ?? "", "Scaffold lines": (r.scaffoldWork ?? []).map((s) => `${s.location}: +${s.erectM3}/-${s.dismantleM3} m³`).join("; "), Crew: r.labourMarks.filter((m) => m.status !== "absent").length }));
  downloadXlsx(`Progress-${a.siteName.replace(/\W+/g, "")}-${f.from}-to-${f.to}`, [
    { name: "Summary", rows: summary },
    { name: "By supervisor", rows: bySup },
    { name: "By plant", rows: byPlant },
    { name: spanDays(f.from, f.to) <= 16 ? "By day" : "By week", rows: byDay },
    { name: "Plan vs actual", rows: plan },
    { name: "DPRs", rows: reports },
  ]);
}
