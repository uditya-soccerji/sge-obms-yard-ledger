"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
import type { DprDocument } from "@/lib/types";

export default function DprDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const { state, saveDpr, submitDpr, reviewDpr } = useStore();
  const original = state.dprDocuments.find((d) => d.id === id);
  const [draft, setDraft] = useState<DprDocument | null>(null);
  const [sicNote, setSicNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

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

  function persist(next: DprDocument) {
    setDraft(next);
  }

  function handleSave() {
    if (!doc) return;
    const r = saveDpr(doc);
    if (!r.ok) {
      setMsg(r.error ?? "Save blocked");
      return;
    }
    setDraft(null);
    setMsg("DPR saved as draft.");
  }

  function handleSubmit() {
    if (!doc) return;
    const r = saveDpr({ ...doc, status: "draft" });
    if (!r.ok) {
      setMsg(r.error ?? "Save blocked");
      return;
    }
    submitDpr(doc.id);
    setDraft(null);
    setMsg("DPR submitted to SIC — frozen until review.");
  }

  function handleReview(decision: "sic_approved" | "sic_rejected") {
    if (!doc) return;
    reviewDpr(doc.id, decision, sicNote);
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

      {canReview ? (
        <Panel>
          <h3 className="mb-2 font-heading text-sm font-bold">SIC review</h3>
          <Label>Approval / rejection note</Label>
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
