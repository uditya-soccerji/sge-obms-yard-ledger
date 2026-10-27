"use client";

import { guarded } from "@/components/shared/require-module";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { blankDpr, DprForm } from "@/components/dpr/dpr-form";
import { SectionHeader } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  allowedDprSubmitterTypes,
  defaultDprSubmitterType,
} from "@/lib/paint-lifecycle";
import { useStore } from "@/lib/store";
import { useWork } from "@/lib/work/store";
import { entrySiteId } from "@/lib/site-scope";
import type { DprSubmitterType } from "@/lib/types";
import type { DprReport } from "@/lib/work/types";

const TYPE_LABEL: Record<DprSubmitterType, string> = {
  painting_blasting: "Painting & Blasting",
  scaffolding: "Scaffolding",
  safety: "Safety",
  store: "Store Keeper",
};

/** Open every section on a new DPR: scaffolding, safety and store bodies alongside the work lines */
function withAllSections(d: DprReport, on: boolean): DprReport {
  if (!on) return d;
  const filled = (t: DprSubmitterType) => blankDpr({ submitterId: d.submitterId, submitterType: t, siteId: d.siteId });
  return {
    ...d,
    allSections: true,
    scaffoldWork: d.scaffoldWork ?? filled("scaffolding").scaffoldWork,
    safetyBody: d.safetyBody ?? filled("safety").safetyBody,
    storeBody: d.storeBody ?? filled("store").storeBody,
  };
}

function NewDprPage() {
  const { state } = useStore();
  const { saveReport, submitReport } = useWork();
  const router = useRouter();

  const staff = useMemo(
    () => state.staff.find((s) => s.id === state.currentUserId),
    [state.staff, state.currentUserId]
  );

  const defaultType = useMemo(
    () => defaultDprSubmitterType(state.currentRole, staff),
    [state.currentRole, staff]
  );

  const allowedTypes = allowedDprSubmitterTypes(state.currentRole, staff);
  const typeLocked = allowedTypes !== "all";

  const site = entrySiteId(state);
  const fieldRole = state.currentRole === "supervisor" || state.currentRole === "store" || state.currentRole === "safety";
  /** Staff on this DPR's site who file this type of DPR */
  const submittersFor = (t: DprSubmitterType) =>
    state.staff.filter((x) => {
      if (x.siteId !== site) return false;
      if (t === "store") return x.role === "store";
      if (t === "safety") return x.role === "safety" || x.supervisorType === "safety";
      if (t === "scaffolding") return x.supervisorType === "scaffolding";
      return x.supervisorType === "painting_blasting";
    });
  // Field roles file their own DPR; Admin / Owner pick whose DPR it is (first on this site by default)
  const defaultSubmitter = useMemo(
    () => (fieldRole ? state.currentUserId ?? "" : submittersFor(defaultType)[0]?.id ?? ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fieldRole, state.currentUserId, defaultType, site]
  );

  const [problems, setProblems] = useState<string[]>([]);
  const [submitterType, setSubmitterType] =
    useState<DprSubmitterType>(defaultType);
  const [submitterId, setSubmitterId] = useState(defaultSubmitter);
  // 2026-10-27: the Admin's DPR has every section open (no type restrictions)
  const allSections = state.currentRole === "admin";
  const [doc, setDoc] = useState<DprReport>(() =>
    withAllSections(
      blankDpr({
        submitterId: defaultSubmitter,
        submitterType: defaultType,
        siteId: entrySiteId(state),
      }),
      allSections
    )
  );

  function changeType(t: DprSubmitterType) {
    if (allowedTypes !== "all" && !allowedTypes.includes(t)) {
      return;
    }
    setSubmitterType(t);
    const sid = fieldRole ? state.currentUserId ?? "" : submittersFor(t)[0]?.id ?? "";
    setSubmitterId(sid);
    // Keep what the Admin already typed; only whose DPR it is changes
    setDoc((d) =>
      allSections
        ? { ...d, submitterId: sid, submitterType: t }
        : blankDpr({
            submitterId: sid,
            submitterType: t,
            siteId: entrySiteId(state),
          })
    );
  }

  /** The DPR as it will be saved (an Admin DPR keeps every section) */
  function prepared() {
    const next = { ...doc, submitterId, submitterType };
    if (!allSections) {
      // Keep only the body for this type
      if (submitterType !== "scaffolding") next.scaffoldWork = undefined;
      if (submitterType !== "safety") next.safetyBody = undefined;
      if (submitterType !== "store") next.storeBody = undefined;
    }
    return next;
  }

  /** Admin DPR: a work line saves the draft first, so the plan's work can be added straight away */
  function ensureSaved() {
    if (!submitterId) return { ok: false, error: "Pick whose DPR this is first" };
    const doc = prepared();
    const r = saveReport(doc);
    return r.ok ? { ok: true, doc } : { ok: false, error: r.error };
  }

  function handleSave(andSubmit: boolean) {
    const next = prepared();
    if (!submitterId) return setProblems(["Pick whose DPR this is (no one on this site files this type yet)"]);
    const r = saveReport(next);
    if (!r.ok) return setProblems([r.error]);
    if (andSubmit) {
      // docs §5: permit + TBT, every crew member marked, quantity or a reason — checked by the store
      const sent = submitReport(next.id);
      if (!sent.ok) {
        // Saved as a draft; open it so the problems can be fixed there
        router.push(`/dpr/${next.id}?problems=${encodeURIComponent(sent.error)}`);
        return;
      }
    }
    router.push(`/dpr/${next.id}`);
  }

  const submitters = submittersFor(submitterType);

  const selectableTypes: DprSubmitterType[] =
    allowedTypes === "all"
      ? ["painting_blasting", "scaffolding", "safety", "store"]
      : allowedTypes;

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="New DPR"
        subtitle={
          typeLocked
            ? `${TYPE_LABEL[submitterType]} record — type locked to your role.`
            : "Create a daily sworn record for SIC verification."
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Submitter type</Label>
          {typeLocked ? (
            <div className="mt-1 flex h-9 items-center rounded-md border border-[var(--sge-line)] px-3 text-sm font-medium">
              {TYPE_LABEL[submitterType]}
            </div>
          ) : (
            <Select
              value={submitterType}
              onValueChange={(v) => changeType(v as DprSubmitterType)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {selectableTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div>
          <Label>Submitter</Label>
          {typeLocked ? (
            <div className="mt-1 flex h-9 items-center rounded-md border border-[var(--sge-line)] px-3 text-sm font-medium">
              {state.staff.find((s) => s.id === submitterId)?.name ??
                submitterId}
            </div>
          ) : (
            <Select
              value={submitterId}
              onValueChange={(v) => {
                setSubmitterId(v);
                setDoc({ ...doc, submitterId: v });
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {submitters.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · {s.designation}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <DprForm value={doc} onChange={setDoc} ensureSaved={allSections ? ensureSaved : undefined} />

      {problems.length ? (
        <div className="rounded-md border border-[var(--sge-crit)]/30 bg-[var(--sge-crit-wash)] px-3 py-2 text-sm text-[var(--sge-crit)]">
          <div className="font-semibold">Fix these before submitting to SIC:</div>
          <ul className="mt-1 list-inside list-disc">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => handleSave(false)}>
          Save draft
        </Button>
        <Button type="button" onClick={() => handleSave(submitterType !== "painting_blasting")}>
          {submitterType === "painting_blasting" ? "Save & add job lines" : "Save & submit to SIC"}
        </Button>
      </div>
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("dpr", NewDprPage, "create");
