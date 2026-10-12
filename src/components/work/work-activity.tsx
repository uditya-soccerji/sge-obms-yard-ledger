"use client";

import { useState } from "react";
import { Panel, StatusPill } from "@/components/shared/ui-bits";
import { Input } from "@/components/ui/input";
import { KIND_LABEL, type EventKind } from "@/lib/work/events";
import { selectCls, tdCls, thCls, useWorkScope } from "./common";

/** Full activity log for Owner / Super Admin (docs §19): who did what, when. */
export function WorkActivity() {
  const s = useWorkScope();
  const [kind, setKind] = useState<EventKind | "all">("all");
  const [problems, setProblems] = useState(false);
  const [q, setQ] = useState("");
  const rows = s.work.events
    .filter((e) => s.inSite(e.siteId) || !e.siteId)
    .filter((e) => kind === "all" || e.kind === kind)
    .filter((e) => !problems || e.problem)
    .filter((e) => !q.trim() || `${e.title} ${e.detail} ${e.actorName}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice()
    .reverse();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--sge-ink-3)]">What</div>
          <select className={selectCls + " mt-1 w-48"} value={kind} onChange={(e) => setKind(e.target.value as EventKind | "all")}>
            <option value="all">Everything</option>
            {(Object.keys(KIND_LABEL) as EventKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </div>
        <div className="w-64">
          <div className="text-[11px] uppercase tracking-wide text-[var(--sge-ink-3)]">Search</div>
          <Input className="mt-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Job, JMS, person…" />
        </div>
        <label className="flex items-center gap-1.5 pb-2 text-sm">
          <input type="checkbox" checked={problems} onChange={(e) => setProblems(e.target.checked)} /> Problems only
        </label>
        <span className="pb-2 text-xs text-[var(--sge-ink-3)]">{rows.length} entries</span>
      </div>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--sge-line)]">
                <th className={thCls}>When</th>
                <th className={thCls}>Who</th>
                <th className={thCls}>What</th>
                <th className={thCls}>Details</th>
                <th className={thCls} />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-[var(--sge-line)]">
                  <td className={tdCls + " whitespace-nowrap text-xs"}>
                    {e.day}
                    <div className="text-[10px] text-[var(--sge-ink-3)]">{new Date(e.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
                  </td>
                  <td className={tdCls + " text-xs"}>
                    <b>{e.actorName}</b>
                    {e.impersonatedBy ? <div className="text-[10px] text-[var(--sge-warn)]">via {e.impersonatedBy} (view-as)</div> : null}
                    <div className="text-[10px] uppercase text-[var(--sge-ink-3)]">{e.actorRole?.replace("_", " ")}</div>
                  </td>
                  <td className={tdCls + " text-xs"}>{KIND_LABEL[e.kind]}</td>
                  <td className={tdCls}>
                    <div className="text-sm">{e.title}</div>
                    <div className="text-xs text-[var(--sge-ink-3)]">{e.detail}{s.allSites && e.siteId ? ` · ${s.siteCode(e.siteId)}` : ""}</div>
                  </td>
                  <td className={tdCls}>{e.problem ? <StatusPill tone="crit">Problem</StatusPill> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
