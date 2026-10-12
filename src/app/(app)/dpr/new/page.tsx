"use client";

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
import { entrySiteId } from "@/lib/site-scope";
import type { DprDocument, DprSubmitterType } from "@/lib/types";

const TYPE_LABEL: Record<DprSubmitterType, string> = {
  painting_blasting: "Painting & Blasting",
  scaffolding: "Scaffolding",
  safety: "Safety",
  store: "Store Keeper",
};

export default function NewDprPage() {
  const { state, saveDpr, submitDpr } = useStore();
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

  const defaultSubmitter = useMemo(() => {
    if (
      state.currentRole === "supervisor" ||
      state.currentRole === "store" ||
      state.currentRole === "safety"
    ) {
      return state.currentUserId ?? "st-sup1";
    }
    if (defaultType === "store") return "st-store";
    if (defaultType === "safety") return "st-safety";
    if (defaultType === "scaffolding") return "st-sup3";
    return "st-sup1";
  }, [state.currentRole, state.currentUserId, defaultType]);

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
    let sid = submitterId;
    if (
      state.currentRole === "supervisor" ||
      state.currentRole === "store" ||
      state.currentRole === "safety"
    ) {
      sid = state.currentUserId ?? sid;
    } else if (t === "store") sid = "st-store";
    else if (t === "safety") sid = "st-safety";
    else if (t === "scaffolding") sid = "st-sup3";
    else sid = "st-sup1";
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
    saveDpr(next);
    if (andSubmit) submitDpr(next.id);
    router.push(`/dpr/${next.id}`);
  }

  const submitters = state.staff.filter((s) => {
    if (submitterType === "store") return s.role === "store";
    if (submitterType === "safety")
      return s.role === "safety" || s.supervisorType === "safety";
    if (submitterType === "scaffolding")
      return s.supervisorType === "scaffolding";
    return s.supervisorType === "painting_blasting";
  });

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

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => handleSave(false)}>
          Save draft
        </Button>
        <Button type="button" onClick={() => handleSave(true)}>
          Save & submit to SIC
        </Button>
      </div>
    </div>
  );
}
