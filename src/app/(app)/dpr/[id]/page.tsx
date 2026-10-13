"use client";

import { guarded } from "@/components/shared/require-module";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { DprForm } from "@/components/dpr/dpr-form";
import {
  Panel,
  SectionHeader,
  StatusPill,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { useWork } from "@/lib/work/store";
import { deadlineOf, isLate } from "@/lib/work/reports";
import type { DprReport } from "@/lib/work/types";

function DprDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const { state } = useStore();
  const { work, saveReport, submitReport, reviewReport, unlockReport } = useWork();
  const search = useSearchParams();
  const [unlockReason, setUnlockReason] = useState("");
  const original = work.reports.find((d) => d.id === id);
  const [draft, setDraft] = useState<DprReport | null>(null);
  const [sicNote, setSicNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  // Problems handed over from "Save & submit" on the new-DPR page
  const [problems, setProblems] = useState<string[]>(() => (search.get("problems") ? search.get("problems")!.split(" · ") : []));

  const doc = draft ?? original;

  const canEdit = useMemo(() => {
    if (!doc) return false;
    if (doc.status !== "draft" && doc.status !== "sic_rejected") return false;
    const role = state.currentRole;
    if (role === "admin" || role === "owner" || role === "super_admin") return true;
    return doc.submitterId === state.currentUserId;
  }, [doc, state.currentRole, state.currentUserId]);

  const canSubmit =
    canEdit && doc && (doc.status === "draft" || doc.status === "sic_rejected");

  const canReview =
    (state.currentRole === "sic" ||
      state.currentRole === "owner" ||
      state.currentRole === "super_admin") &&
    doc?.status === "submitted";

  if (!original || !doc) {
    return (
      <div className="sge-enter space-y-4">
        <SectionHeader title="DPR not found" />
        <Link href="/dpr">
          <Button variant="outline">Back to DPR desk</Button>
        </Link>
      </div>
    );
  }

  function persist(next: DprReport) {
    setDraft(next);
  }

  function handleSave() {
    if (!doc) return;
    const r = saveReport(doc);
    if (!r.ok) {
      setMsg(r.error);
      return;
    }
    setDraft(null);
    setProblems([]);
    setMsg("DPR saved as draft.");
  }

  function handleSubmit() {
    if (!doc) return;
    const r = saveReport(doc);
    if (!r.ok) {
      setMsg(r.error);
      return;
    }
    // docs §5: permit + TBT, every crew member marked, quantity or a reason
    const sent = submitReport(doc.id);
    if (!sent.ok) {
      setProblems(sent.error.split(" · "));
      return;
    }
    setProblems([]);
    setDraft(null);
    setMsg("DPR submitted to SIC — frozen until review.");
  }

  function handleReview(decision: "sic_approved" | "sic_rejected") {
    if (!doc) return;
    const r = reviewReport(doc.id, decision, sicNote);
    if (!r.ok) {
      setMsg(r.error);
      return;
    }
    setMsg(
      decision === "sic_approved"
        ? "Approved — attendance derived for ACPL match."
        : "Rejected with note."
    );
    router.push("/approvals/sic");
  }

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title={`DPR · ${doc.date} · ${doc.plant}`}
        subtitle={`${doc.submitterType.replace("_", " / ")} · ${state.staff.find((s) => s.id === doc.submitterId)?.name ?? doc.submitterId}`}
        action={
          <div className="flex flex-wrap gap-2">
            <StatusPill
              tone={
                doc.status === "sic_approved"
                  ? "ok"
                  : doc.status === "sic_rejected"
                    ? "crit"
                    : doc.status === "submitted"
                      ? "accent"
                      : "default"
              }
            >
              {doc.status.replace("_", " ")}
            </StatusPill>
            {isLate(doc) ? <StatusPill tone="warn">late · due {deadlineOf(doc).slice(0, 10)} 10:00</StatusPill> : null}
            {doc.enteredBy === "admin" ? <StatusPill>entered by Admin</StatusPill> : null}
            <Link href="/dpr">
              <Button size="sm" variant="outline">
                Desk
              </Button>
            </Link>
          </div>
        }
      />

      {msg ? (
        <div className="rounded-md border border-[var(--sge-ok)]/30 bg-[var(--sge-ok-wash)] px-3 py-2 text-sm text-[var(--sge-ok)]">
          {msg}
        </div>
      ) : null}

      {doc.sicNote ? (
        <Panel>
          <div className="text-xs font-semibold uppercase text-[var(--sge-ink-3)]">
            SIC note
          </div>
          <p className="mt-1 text-sm">{doc.sicNote}</p>
        </Panel>
      ) : null}

      <DprForm
        value={doc}
        onChange={persist}
        readOnly={!canEdit}
      />

      {problems.length ? (
        <div className="rounded-md border border-[var(--sge-crit)]/30 bg-[var(--sge-crit-wash)] px-3 py-2 text-sm text-[var(--sge-crit)]">
          <div className="font-semibold">Fix these before submitting to SIC:</div>
          <ul className="mt-1 list-inside list-disc">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      ) : null}

      {canEdit || canSubmit ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={handleSave}>
            Save draft
          </Button>
          {canSubmit ? (
            <Button type="button" onClick={handleSubmit}>
              Submit to SIC
            </Button>
          ) : null}
        </div>
      ) : null}

      {doc.unlocks?.length ? (
        <Panel>
          <div className="text-xs font-semibold uppercase text-[var(--sge-ink-3)]">Unlocked after approval</div>
          {doc.unlocks.map((u) => (
            <p key={u.at} className="mt-1 text-sm">{u.at.slice(0, 10)} · {u.by}: {u.reason}</p>
          ))}
        </Panel>
      ) : null}

      {doc.status === "sic_approved" && (state.currentRole === "owner" || state.currentRole === "super_admin") ? (
        <Panel>
          <h3 className="mb-2 font-heading text-sm font-bold">Unlock for editing (Owner)</h3>
          <p className="mb-2 text-xs text-[var(--sge-ink-3)]">The DPR goes back to draft and leaves attendance until it is approved again. The reason is logged.</p>
          <div className="flex flex-wrap items-end gap-2">
            <Textarea className="min-w-[260px] flex-1" rows={2} value={unlockReason} onChange={(e) => setUnlockReason(e.target.value)} placeholder="Why it needs changing" />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const r = unlockReport(doc.id, unlockReason);
                setMsg(r.ok ? "Unlocked — the supervisor can edit and resubmit." : r.error ?? "Unlock blocked");
                if (r.ok) setUnlockReason("");
              }}
            >
              Unlock DPR
            </Button>
          </div>
        </Panel>
      ) : null}

      {canReview ? (
        <Panel>
          <h3 className="mb-2 font-heading text-sm font-bold">SIC review</h3>
          <Label>Approval / rejection note (a reason is required to reject)</Label>
          <Textarea
            className="mt-1 mb-3"
            value={sicNote}
            onChange={(e) => setSicNote(e.target.value)}
            placeholder="Verified work face / reject reason…"
          />
          <div className="flex gap-2">
            <Button type="button" onClick={() => handleReview("sic_approved")}>
              Approve
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleReview("sic_rejected")}
            >
              Reject
            </Button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("dpr", DprDetailPage);
