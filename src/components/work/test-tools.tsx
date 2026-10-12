"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Panel } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { SCENARIOS } from "@/lib/work/scenarios";
import { useWork } from "@/lib/work/store";
import { Msg, selectCls } from "./common";

/** Demo accounts a tester can "view as" (seed logins). */
const VIEW_AS = [
  { id: "usr-paint", label: "Supervisor — V. Chauhan" },
  { id: "usr-sic", label: "SIC — R. Mehta" },
  { id: "usr-admin", label: "Admin (data operator)" },
  { id: "usr-finance", label: "Finance" },
  { id: "usr-owner", label: "Owner" },
];

/**
 * Test helpers for Owner / Super Admin: switch seat without signing out,
 * load a prepared scenario, or reset. Collapsed by default.
 */
export function TestTools() {
  const { state, startImpersonation } = useStore();
  const { loadScenario, resetWork } = useWork();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [viewAs, setViewAs] = useState(VIEW_AS[0].id);
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const role = state.currentRole;
  if (state.impersonatorAccountId || (role !== "super_admin" && role !== "owner")) return null;

  return (
    <Panel className="border-dashed">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen((o) => !o)}>
        <span className="flex items-center gap-2 font-heading text-sm font-bold">
          <FlaskConical className="h-4 w-4 text-[var(--sge-brass-ink)]" /> Test tools
        </span>
        <span className="text-xs text-[var(--sge-ink-3)]">{open ? "Hide" : "View as · scenarios · reset"}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-4">
          {role === "super_admin" ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[240px]">
                <div className="text-[11px] uppercase tracking-wide text-[var(--sge-ink-3)]">View as</div>
                <select className={selectCls + " mt-1"} value={viewAs} onChange={(e) => setViewAs(e.target.value)}>
                  {VIEW_AS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  const r = startImpersonation(viewAs);
                  if (!r.ok) return setMsg({ ok: false, msg: r.error });
                  router.push("/work");
                }}
              >
                Switch seat
              </Button>
              <span className="text-[11px] text-[var(--sge-ink-3)]">Use the banner at the top to come back to Super Admin.</span>
            </div>
          ) : null}

          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-[var(--sge-ink-3)]">Scenarios (start from fresh demo data)</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {SCENARIOS.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => {
                    loadScenario(sc.id);
                    setMsg({ ok: true, msg: `Scenario loaded: ${sc.label}.` });
                  }}
                  className="rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)] p-2.5 text-left hover:border-[var(--sge-brass)] hover:bg-[var(--sge-brass-wash)]"
                >
                  <div className="text-sm font-semibold">{sc.label}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-[var(--sge-ink-3)]">{sc.detail}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                resetWork();
                setMsg({ ok: true, msg: "Work demo data reset." });
              }}
            >
              Reset work demo
            </Button>
            <Msg text={msg} />
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
