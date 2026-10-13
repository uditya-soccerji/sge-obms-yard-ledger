"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Panel } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { canUseTestTools } from "@/lib/permissions";
import { useStore } from "@/lib/store";
import { SCENARIOS } from "@/lib/work/scenarios";
import { useWork } from "@/lib/work/store";
import { demoToday, realToday, setDemoToday } from "@/lib/today";
import { WORK_TODAY } from "@/lib/work/seed";
import { Msg, selectCls } from "./common";

/** Demo accounts a tester can "view as" — matched by username, since account ids differ once logins live in Supabase. */
const VIEW_AS = [
  { id: "paint", label: "Supervisor — V. Chauhan" },
  { id: "solanki", label: "Supervisor — K. Solanki" },
  { id: "sic", label: "SIC — R. Mehta" },
  { id: "admin", label: "Admin (data operator)" },
  { id: "finance", label: "Finance" },
  { id: "owner", label: "Owner" },
];

/**
 * Test helpers for Owner / Super Admin: switch seat without signing out,
 * load a prepared scenario, or reset. Collapsed by default.
 */
export function TestTools() {
  const { state, fullState, startImpersonation } = useStore();
  const { loadScenario, loadDemo, resetWork } = useWork();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [viewAs, setViewAs] = useState(VIEW_AS[0].id);
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const role = state.currentRole;
  if (!canUseTestTools(role, !!state.impersonatorAccountId)) return null;

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
                  const target = fullState.users.find((u) => u.username === viewAs);
                  if (!target) return setMsg({ ok: false, msg: `No account "@${viewAs}" found` });
                  const r = startImpersonation(target.id);
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
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-[var(--sge-ink-3)]">Demo data</div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  loadDemo();
                  setMsg({ ok: true, msg: `DTA Aug–Sep demo loaded; the app date is now ${WORK_TODAY}.` });
                }}
              >
                Load demo (DTA Aug–Sep)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!window.confirm("Start fresh? This empties Work (plan, jobs, DPRs, JMS, paint, costs) and goes back to today's date.")) return;
                  resetWork();
                  setMsg({ ok: true, msg: "Started fresh: an empty month on today's date." });
                }}
              >
                Start fresh
              </Button>
              <span className="text-[11px] text-[var(--sge-ink-3)]">Work starts empty for real use (merge plan Step 1); the demo is for trying things out.</span>
            </div>
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-[var(--sge-ink-3)]">Scenarios (load the demo, then set up one situation)</div>
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

          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-[var(--sge-ink-3)]">App date</div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                Using <b>{demoToday() ?? realToday()}</b> {demoToday() ? "(demo date)" : "(today)"}
              </span>
              <Button size="sm" variant="outline" onClick={() => { setDemoToday(WORK_TODAY); location.reload(); }}>
                Use the demo date ({WORK_TODAY})
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setDemoToday(null); location.reload(); }}>
                Use today
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-[var(--sge-ink-3)]">The demo data is set in Aug–Sep 2026; the demo date replays it as if it were live. This browser only.</p>
          </div>

          <Msg text={msg} />
        </div>
      ) : null}
    </Panel>
  );
}
