"use client";

import { useState } from "react";
import { EmptyState, formatINR, Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { useWork } from "@/lib/work/store";
import { fmtM2, Msg, useWorkScope } from "./common";

/**
 * JMS waiting for the Admin (docs §24): after the SIC confirms an ended job, the
 * Admin enters RIL's JMS no. and the amount and submits — then Finance sees it.
 * The Admin can send it back when the DPR compilation is wrong (the job reopens).
 */
export function JmsAdminQueue() {
  const { state } = useStore();
  const { adminApproveJms, adminReturnJms } = useWork();
  const s = useWorkScope();
  const { work } = s;
  const canAct = state.currentRole === "admin" || state.currentRole === "owner" || state.currentRole === "super_admin";
  const rows = work.jms.filter((j) => j.adminStatus === "pending_admin" && s.lineIds.has(j.planLineId)).sort((a, b) => a.confirmedOn.localeCompare(b.confirmedOn));
  const [no, setNo] = useState<Record<string, string>>({});
  const [amt, setAmt] = useState<Record<string, string>>({});
  const [back, setBack] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-sm font-bold">JMS waiting for the Admin</h3>
        {rows.length ? <StatusPill tone="warn">{rows.length} to finish</StatusPill> : null}
        <span className="text-xs text-[var(--sge-ink-3)]">Enter RIL&apos;s JMS no. and the amount, then submit — Finance sees it after that.</span>
      </div>
      <Msg text={msg} />
      {rows.length === 0 ? (
        <EmptyState title="Nothing waiting" detail="A JMS lands here when the SIC confirms an ended job." />
      ) : (
        <div className="space-y-3">
          {rows.map((j) => {
            const job = work.jobs.find((x) => x.id === j.jobId);
            const line = s.line(j.planLineId);
            const amount = amt[j.id] ?? String(j.amount);
            return (
              <div key={j.id} className="rounded-md border border-[var(--sge-line)] bg-[var(--sge-ground)] p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-heading font-bold">{job?.jobNo ?? j.jobId}</span>
                  <span className="text-[var(--sge-ink-2)]">
                    {line?.plant} · {job?.location} · {job ? s.staffName(job.supervisorId) : ""}
                  </span>
                  <span className="ml-auto font-mono text-xs text-[var(--sge-ink-3)]">internal JMS {j.jmsNo} · confirmed {j.confirmedOn}</span>
                </div>
                <div className="mt-1 font-mono text-xs text-[var(--sge-ink-2)]">
                  DPRs {j.periodFrom} → {j.periodTo} · {fmtM2(j.qty)} m² × ₹{j.rate} = {formatINR(j.computedAmount ?? j.amount)} · {j.serviceCode}
                  {j.ratePending ? " · placeholder rate" : ""}
                </div>
                {canAct ? (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="text-xs">
                      JMS no. (RIL, 7 digits)
                      <Input aria-label={`JMS no. for ${job?.jobNo}`} className="mt-1 h-8 w-36 font-mono" inputMode="numeric" value={no[j.id] ?? ""} onChange={(e) => setNo({ ...no, [j.id]: e.target.value })} />
                    </label>
                    <label className="text-xs">
                      Amount (₹)
                      <Input aria-label={`Amount for ${job?.jobNo}`} className="mt-1 h-8 w-36 font-mono" type="number" min={0} value={amount} onChange={(e) => setAmt({ ...amt, [j.id]: e.target.value })} />
                    </label>
                    <Button
                      size="sm"
                      onClick={() => {
                        const r = adminApproveJms(j.id, no[j.id] ?? "", Number(amount));
                        setMsg(r.ok ? { ok: true, msg: `JMS ${no[j.id]} approved — Finance has it now.` } : { ok: false, msg: r.error });
                      }}
                    >
                      Submit to Finance
                    </Button>
                    <Input aria-label={`Send-back reason for ${job?.jobNo}`} className="h-8 min-w-[200px] flex-1" placeholder="What's wrong with the DPRs? (to send back)" value={back[j.id] ?? ""} onChange={(e) => setBack({ ...back, [j.id]: e.target.value })} />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const r = adminReturnJms(j.id, back[j.id] ?? "");
                        setMsg(r.ok ? { ok: true, msg: `Sent back — ${job?.jobNo} is open again for the supervisor.` } : { ok: false, msg: r.error });
                      }}
                    >
                      Send back
                    </Button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[var(--sge-ink-3)]">With the Admin for the JMS no. and amount.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
