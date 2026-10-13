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
import { dprSaveEvent } from "@/lib/dpr-review";
import { useWork } from "@/lib/work/store";
import { dprCrew, validateDprForSubmit } from "@/lib/dpr-validate";
import { entrySiteId } from "@/lib/site-scope";
import type { DprDocument, DprSubmitterType } from "@/lib/types";

const TYPE_LABEL: Record<DprSubmitterType, string> = {
  painting_blasting: "Painting & Blasting",
  scaffolding: "Scaffolding",
  safety: "Safety",
  store: "Store Keeper",
};

function NewDprPage() {
  const { state, saveDpr, submitDpr } = useStore();
  const { notify } = useWork();
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
  const [doc, setDoc] = useState<DprDocument>(() =>
    blankDpr({
      submitterId: defaultSubmitter,
      submitterType: defaultType,
      siteId: entrySiteId(state),
    })
  );

  function changeType(t: DprSubmitterType) {
    if (allowedTypes !== "all" && !allowedTypes.includes(t)) {
      return;
    }
    setSubmitterType(t);
    const sid = fieldRole ? state.currentUserId ?? "" : submittersFor(t)[0]?.id ?? "";
    setSubmitterId(sid);
    setDoc(
      blankDpr({
        submitterId: sid,
        submitterType: t,
        siteId: entrySiteId(state),
      })
    );
  }

  function handleSave(andSubmit: boolean) {
    const next = { ...doc, submitterId, submitterType };
    if (!submitterId) return setProblems(["Pick whose DPR this is (no one on this site files this type yet)"]);
    // Strip wrong-type bodies for safety (no paint fields)
    if (submitterType === "safety") {
      next.paintWork = undefined;
      next.scaffoldWork = undefined;
      next.storeBody = undefined;
    } else if (submitterType === "scaffolding") {
      next.paintWork = undefined;
      next.safetyBody = undefined;
      next.storeBody = undefined;
    } else if (submitterType === "painting_blasting") {
      next.scaffoldWork = undefined;
      next.safetyBody = undefined;
      next.storeBody = undefined;
    } else if (submitterType === "store") {
      next.paintWork = undefined;
      next.scaffoldWork = undefined;
      next.safetyBody = undefined;
    }
    if (andSubmit) {
      // docs §5: permit + TBT, every crew member marked, quantity or a reason
      const plants = state.sites.find((x) => x.id === next.siteId)?.plants ?? [];
      const found = validateDprForSubmit(next, dprCrew(next, state.labourers), plants);
      setProblems(found);
      if (found.length) return;
    }
    const r = saveDpr(next);
    if (!r.ok) return setProblems([r.error ?? "Save blocked"]);
    if (andSubmit) submitDpr(next.id);
    // B08: SIC + Admin are told (submit at once, a draft in the daily summary)
    notify(dprSaveEvent(andSubmit ? "dpr_submitted" : "dpr_saved", next, state.staff));
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

      <DprForm value={doc} onChange={setDoc} />

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
        <Button type="button" onClick={() => handleSave(true)}>
          Save & submit
        </Button>
      </div>
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("dpr", NewDprPage, "create");
