"use client";

import { Panel } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  blankObservation,
  CHECKLIST_ANSWERS,
  checklistGroups,
  recomputeGlanceFromObservations,
  SAFETY_NEAR_MISS_TYPES,
  SAFETY_PERMIT_TYPES,
  SAFETY_SHIFTS,
} from "@/lib/safety-dpr";
import type {
  DprSafetyBody,
  SafetyGlanceNumbers,
  SafetyObservation,
  SafetyPermitType,
} from "@/lib/types";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function GlanceField({
  label,
  value,
  onChange,
  readOnly,
  computed,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  readOnly?: boolean;
  /** Worked out from the observations below, so it can't be typed over */
  computed?: boolean;
}) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wide text-[var(--sge-ink-3)]">
        {label}
      </Label>
      <Input
        type="number"
        className="mt-0.5 h-8"
        disabled={readOnly || computed}
        title={computed ? "Counted from the observations in section A" : undefined}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function SafetyDprForm({
  body,
  onChange,
  readOnly,
}: {
  body: DprSafetyBody;
  onChange: (next: DprSafetyBody) => void;
  readOnly?: boolean;
}) {
  function patch(partial: Partial<DprSafetyBody>) {
    onChange({ ...body, ...partial });
  }

  function setGlance(glance: SafetyGlanceNumbers) {
    patch({ glance });
  }

  function setObservations(observations: SafetyObservation[]) {
    patch({
      observations,
      glance: recomputeGlanceFromObservations(observations, body.glance),
    });
  }

  function updateObs(id: string, partial: Partial<SafetyObservation>) {
    setObservations(
      body.observations.map((o) => (o.id === id ? { ...o, ...partial } : o))
    );
  }

  function addObs() {
    setObservations([...body.observations, blankObservation()]);
  }

  function removeObs(id: string) {
    setObservations(body.observations.filter((o) => o.id !== id));
  }

  function addPermit() {
    patch({
      permits: [
        ...body.permits,
        {
          id: uid("perm"),
          permitType: "hot_work",
          count: 0,
          permitNos: "",
          manpower: 0,
          gasTestOk: false,
          allClosedOk: false,
        },
      ],
    });
  }

  function toggleTomorrowJob(job: SafetyPermitType) {
    const set = new Set(body.talks.tomorrowRiskyJobs);
    if (set.has(job)) set.delete(job);
    else set.add(job);
    patch({
      talks: { ...body.talks, tomorrowRiskyJobs: [...set] },
    });
  }

  const groups = checklistGroups(body.checklist);

  return (
    <div className="space-y-4">
      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
          Header · F/HSE/008
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label>Shift</Label>
            <Select
              disabled={readOnly}
              value={body.shift}
              onValueChange={(v) => patch({ shift: v as DprSafetyBody["shift"] })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SAFETY_SHIFTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Safety Officer</Label>
            <Input
              className="mt-1"
              disabled={readOnly}
              value={body.safetyOfficer}
              onChange={(e) => patch({ safetyOfficer: e.target.value })}
            />
          </div>
          <div>
            <Label>RIL EIC</Label>
            <Input
              className="mt-1"
              disabled={readOnly}
              value={body.rilEic}
              onChange={(e) => patch({ rilEic: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Site In-charge</Label>
            <Input
              className="mt-1"
              disabled={readOnly}
              value={body.siteInCharge}
              onChange={(e) => patch({ siteInCharge: e.target.value })}
            />
          </div>
        </div>
      </Panel>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
          Today at a glance
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <GlanceField
            label="SGE workers"
            value={body.glance.sgeWorkers}
            readOnly={readOnly}
            onChange={(n) => setGlance({ ...body.glance, sgeWorkers: n })}
          />
          <GlanceField
            label="Sub-contractor"
            value={body.glance.subContractor}
            readOnly={readOnly}
            onChange={(n) => setGlance({ ...body.glance, subContractor: n })}
          />
          <GlanceField
            label="Man-hours"
            value={body.glance.manHours}
            readOnly={readOnly}
            onChange={(n) => setGlance({ ...body.glance, manHours: n })}
          />
          <GlanceField
            label="TBT people"
            value={body.glance.tbtPeople}
            readOnly={readOnly}
            onChange={(n) => setGlance({ ...body.glance, tbtPeople: n })}
          />
          <GlanceField
            label="Hurt / near miss"
            value={body.glance.hurtNearMiss}
            readOnly={readOnly}
            onChange={(n) => setGlance({ ...body.glance, hurtNearMiss: n })}
          />
          <GlanceField
            label="SAFE obs"
            computed
            value={body.glance.safeObs}
            readOnly={readOnly}
            onChange={(n) => setGlance({ ...body.glance, safeObs: n })}
          />
          <GlanceField
            label="UNSAFE obs"
            computed
            value={body.glance.unsafeObs}
            readOnly={readOnly}
            onChange={(n) => setGlance({ ...body.glance, unsafeObs: n })}
          />
          <GlanceField
            label="Closed"
            computed
            value={body.glance.closed}
            readOnly={readOnly}
            onChange={(n) => setGlance({ ...body.glance, closed: n })}
          />
          <GlanceField
            label="Still open"
            computed
            value={body.glance.stillOpen}
            readOnly={readOnly}
            onChange={(n) => setGlance({ ...body.glance, stillOpen: n })}
          />
          <GlanceField
            label="Late >10 days"
            computed
            value={body.glance.lateOver10Days}
            readOnly={readOnly}
            onChange={(n) => setGlance({ ...body.glance, lateOver10Days: n })}
          />
        </div>
        <p className="mt-2 text-xs text-[var(--sge-ink-3)]">
          SAFE / UNSAFE / closed / open / late counts are counted from the Section A
          observations, so they always match them.
        </p>
      </Panel>

      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            A · Observations
          </h3>
          {!readOnly ? (
            <Button type="button" size="sm" variant="outline" onClick={addObs}>
              Add observation
            </Button>
          ) : null}
        </div>
        {body.observations.length === 0 ? (
          <p className="text-sm text-[var(--sge-ink-3)]">
            No observations yet — add rows for SAFE / UA / UC findings.
          </p>
        ) : (
          <div className="space-y-4">
            {body.observations.map((obs) => (
              <div
                key={obs.id}
                className="rounded-md border border-[var(--sge-line)] p-3"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase text-[var(--sge-ink-3)]">
                    Observation
                  </span>
                  {!readOnly ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-red-600"
                      onClick={() => removeObs(obs.id)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label className="text-[10px]">Obs No.</Label>
                    <Input
                      className="mt-0.5 h-8"
                      disabled={readOnly}
                      placeholder="Area-DDMM-No"
                      value={obs.obsNo}
                      onChange={(e) =>
                        updateObs(obs.id, { obsNo: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Type</Label>
                    <Select
                      disabled={readOnly}
                      value={obs.type}
                      onValueChange={(v) =>
                        updateObs(obs.id, { type: v as SafetyObservation["type"] })
                      }
                    >
                      <SelectTrigger className="mt-0.5 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SAFE">SAFE</SelectItem>
                        <SelectItem value="UA">UA — unsafe act</SelectItem>
                        <SelectItem value="UC">UC — unsafe condition</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px]">From</Label>
                    <Select
                      disabled={readOnly}
                      value={obs.from}
                      onValueChange={(v) =>
                        updateObs(obs.id, { from: v as SafetyObservation["from"] })
                      }
                    >
                      <SelectTrigger className="mt-0.5 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="R">R — RIL found</SelectItem>
                        <SelectItem value="J">J — joint walk</SelectItem>
                        <SelectItem value="N">N — near miss</SelectItem>
                        <SelectItem value="S">S — self</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px]">Status</Label>
                    <Select
                      disabled={readOnly}
                      value={obs.status}
                      onValueChange={(v) =>
                        updateObs(obs.id, {
                          status: v as SafetyObservation["status"],
                        })
                      }
                    >
                      <SelectTrigger className="mt-0.5 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OPEN">OPEN</SelectItem>
                        <SelectItem value="CLOSED">CLOSED</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {obs.type !== "SAFE" ? (
                    <div>
                      <Label className="text-[10px]">Risk</Label>
                      <Select
                        disabled={readOnly}
                        value={obs.risk ?? "MEDIUM"}
                        onValueChange={(v) =>
                          updateObs(obs.id, {
                            risk: v as SafetyObservation["risk"],
                          })
                        }
                      >
                        <SelectTrigger className="mt-0.5 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="HIGH">HIGH</SelectItem>
                          <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                          <SelectItem value="LOW">LOW</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div>
                    <Label className="text-[10px]">Checked by</Label>
                    <Select
                      disabled={readOnly}
                      value={obs.checkedBy}
                      onValueChange={(v) =>
                        updateObs(obs.id, {
                          checkedBy: v as SafetyObservation["checkedBy"],
                        })
                      }
                    >
                      <SelectTrigger className="mt-0.5 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="R">R</SelectItem>
                        <SelectItem value="J">J</SelectItem>
                        <SelectItem value="N">N</SelectItem>
                        <SelectItem value="S">S</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px]">1st found on</Label>
                    <Input
                      type="date"
                      className="mt-0.5 h-8"
                      disabled={readOnly}
                      value={obs.firstFoundOn}
                      onChange={(e) =>
                        updateObs(obs.id, { firstFoundOn: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Fix by date</Label>
                    <Input
                      type="date"
                      className="mt-0.5 h-8"
                      disabled={readOnly}
                      value={obs.fixByDate}
                      onChange={(e) =>
                        updateObs(obs.id, { fixByDate: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="mt-2 grid gap-2">
                  <div>
                    <Label className="text-[10px]">WHERE + WHAT</Label>
                    <Textarea
                      className="mt-0.5"
                      rows={2}
                      disabled={readOnly}
                      value={obs.whereWhat}
                      onChange={(e) =>
                        updateObs(obs.id, { whereWhat: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-[10px]">ACTION taken</Label>
                      <Input
                        className="mt-0.5"
                        disabled={readOnly}
                        value={obs.actionTaken}
                        onChange={(e) =>
                          updateObs(obs.id, { actionTaken: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Who will fix</Label>
                      <Input
                        className="mt-0.5"
                        disabled={readOnly}
                        value={obs.whoWillFix}
                        onChange={(e) =>
                          updateObs(obs.id, { whoWillFix: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
          Daily checklist · F/HSE/008-C
        </h3>
        <div className="space-y-4">
          {groups.map(({ group, items }) => (
            <div key={group}>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--sge-ink-2)]">
                {group}
              </div>
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-sm">
                      <span className="font-mono text-[11px] text-[var(--sge-ink-3)]">
                        {String(item.id).padStart(2, "0")}.
                      </span>{" "}
                      {item.label}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {CHECKLIST_ANSWERS.map((a) => (
                        <Button
                          key={a.value}
                          type="button"
                          size="sm"
                          disabled={readOnly}
                          variant={
                            item.answer === a.value ? "default" : "outline"
                          }
                          className="h-7 min-w-[2.5rem] px-2 text-xs"
                          onClick={() => {
                            const checklist = body.checklist.map((c) =>
                              c.id === item.id
                                ? { ...c, answer: a.value }
                                : c
                            );
                            patch({ checklist });
                          }}
                        >
                          {a.short}
                        </Button>
                      ))}
                      {item.answer === "fail" ? (
                        <Input
                          className="h-8 w-36 text-xs"
                          disabled={readOnly}
                          placeholder="Obs No."
                          value={item.linkedObsNo ?? ""}
                          onChange={(e) => {
                            const checklist = body.checklist.map((c) =>
                              c.id === item.id
                                ? { ...c, linkedObsNo: e.target.value }
                                : c
                            );
                            patch({ checklist });
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            B · Work permits
          </h3>
          {!readOnly ? (
            <Button type="button" size="sm" variant="outline" onClick={addPermit}>
              Add permit row
            </Button>
          ) : null}
        </div>
        {body.permits.length === 0 ? (
          <p className="text-sm text-[var(--sge-ink-3)]">No permits logged today.</p>
        ) : (
          <div className="space-y-3">
            {body.permits.map((row, idx) => (
              <div
                key={row.id}
                className="grid gap-2 rounded-md border border-[var(--sge-line)] p-3 sm:grid-cols-2 lg:grid-cols-4"
              >
                <div>
                  <Label className="text-[10px]">Type</Label>
                  <Select
                    disabled={readOnly}
                    value={row.permitType}
                    onValueChange={(v) => {
                      const permits = body.permits.map((p, i) =>
                        i === idx
                          ? { ...p, permitType: v as SafetyPermitType }
                          : p
                      );
                      patch({ permits });
                    }}
                  >
                    <SelectTrigger className="mt-0.5 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SAFETY_PERMIT_TYPES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px]">Count</Label>
                  <Input
                    type="number"
                    className="mt-0.5 h-8"
                    disabled={readOnly}
                    value={row.count}
                    onChange={(e) => {
                      const permits = body.permits.map((p, i) =>
                        i === idx ? { ...p, count: Number(e.target.value) } : p
                      );
                      patch({ permits });
                    }}
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Permit nos.</Label>
                  <Input
                    className="mt-0.5 h-8"
                    disabled={readOnly}
                    value={row.permitNos}
                    onChange={(e) => {
                      const permits = body.permits.map((p, i) =>
                        i === idx ? { ...p, permitNos: e.target.value } : p
                      );
                      patch({ permits });
                    }}
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Manpower</Label>
                  <Input
                    type="number"
                    className="mt-0.5 h-8"
                    disabled={readOnly}
                    value={row.manpower}
                    onChange={(e) => {
                      const permits = body.permits.map((p, i) =>
                        i === idx
                          ? { ...p, manpower: Number(e.target.value) }
                          : p
                      );
                      patch({ permits });
                    }}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={row.gasTestOk}
                    onChange={(e) => {
                      const permits = body.permits.map((p, i) =>
                        i === idx ? { ...p, gasTestOk: e.target.checked } : p
                      );
                      patch({ permits });
                    }}
                  />
                  Gas test ✓
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={row.allClosedOk}
                    onChange={(e) => {
                      const permits = body.permits.map((p, i) =>
                        i === idx ? { ...p, allClosedOk: e.target.checked } : p
                      );
                      patch({ permits });
                    }}
                  />
                  All closed ✓
                </label>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
          C · Talks / PPE / tomorrow
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <GlanceField
            label="TBT sessions"
            value={body.talks.tbtCount}
            readOnly={readOnly}
            onChange={(n) =>
              patch({ talks: { ...body.talks, tbtCount: n } })
            }
          />
          <GlanceField
            label="Induction"
            value={body.talks.inductionCount}
            readOnly={readOnly}
            onChange={(n) =>
              patch({ talks: { ...body.talks, inductionCount: n } })
            }
          />
          <GlanceField
            label="RIL session"
            value={body.talks.rilSessionCount}
            readOnly={readOnly}
            onChange={(n) =>
              patch({ talks: { ...body.talks, rilSessionCount: n } })
            }
          />
        </div>
        <div className="mt-3">
          <Label>PPE given (note)</Label>
          <Input
            className="mt-1"
            disabled={readOnly}
            value={body.talks.ppeGivenNote}
            onChange={(e) =>
              patch({
                talks: { ...body.talks, ppeGivenNote: e.target.value },
              })
            }
          />
        </div>
        <div className="mt-3">
          <Label className="mb-2 block">Tomorrow&apos;s risky jobs</Label>
          <div className="flex flex-wrap gap-2">
            {SAFETY_PERMIT_TYPES.map((p) => (
              <Button
                key={p.value}
                type="button"
                size="sm"
                disabled={readOnly}
                variant={
                  body.talks.tomorrowRiskyJobs.includes(p.value)
                    ? "default"
                    : "outline"
                }
                onClick={() => toggleTomorrowJob(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Input
            className="mt-2"
            disabled={readOnly}
            placeholder="Free topic (e.g. V-204 confined entry)"
            value={body.talks.tomorrowTopic}
            onChange={(e) =>
              patch({
                talks: { ...body.talks, tomorrowTopic: e.target.value },
              })
            }
          />
        </div>
      </Panel>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
          D / E · Met RIL · Near miss · Incidents
        </h3>
        <div className="mb-3">
          <Label>Met RIL (note)</Label>
          <Textarea
            className="mt-1"
            rows={2}
            disabled={readOnly}
            value={body.metRilNote}
            onChange={(e) => patch({ metRilNote: e.target.value })}
          />
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <div>
            <Label>Near miss type</Label>
            <Select
              disabled={readOnly}
              value={body.nearMissType}
              onValueChange={(v) =>
                patch({ nearMissType: v as DprSafetyBody["nearMissType"] })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SAFETY_NEAR_MISS_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Near miss detail</Label>
            <Input
              className="mt-1"
              disabled={readOnly}
              value={body.nearMissNote}
              onChange={(e) => patch({ nearMissNote: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(
            [
              ["lti", "LTI"],
              ["mtc", "MTC"],
              ["firstAid", "First aid"],
              ["nearMiss", "Near miss"],
              ["damageFire", "Damage / fire"],
            ] as const
          ).map(([key, label]) => (
            <GlanceField
              key={key}
              label={label}
              value={body.incidentCounts[key]}
              readOnly={readOnly}
              onChange={(n) =>
                patch({
                  incidentCounts: { ...body.incidentCounts, [key]: n },
                })
              }
            />
          ))}
        </div>
      </Panel>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
          F · Sign-off
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Safety Officer</Label>
            <Input
              className="mt-1"
              disabled={readOnly}
              value={body.signOff.safetyOfficerName}
              onChange={(e) =>
                patch({
                  signOff: {
                    ...body.signOff,
                    safetyOfficerName: e.target.value,
                  },
                })
              }
            />
            <Input
              type="time"
              className="mt-1"
              disabled={readOnly}
              value={body.signOff.safetyOfficerTime}
              onChange={(e) =>
                patch({
                  signOff: {
                    ...body.signOff,
                    safetyOfficerTime: e.target.value,
                  },
                })
              }
            />
          </div>
          <div>
            <Label>SIC</Label>
            <Input
              className="mt-1"
              disabled={readOnly}
              value={body.signOff.sicName}
              onChange={(e) =>
                patch({
                  signOff: { ...body.signOff, sicName: e.target.value },
                })
              }
            />
            <Input
              type="time"
              className="mt-1"
              disabled={readOnly}
              value={body.signOff.sicTime}
              onChange={(e) =>
                patch({
                  signOff: { ...body.signOff, sicTime: e.target.value },
                })
              }
            />
          </div>
          <div>
            <Label>RIL</Label>
            <Input
              className="mt-1"
              disabled={readOnly}
              value={body.signOff.rilName}
              onChange={(e) =>
                patch({
                  signOff: { ...body.signOff, rilName: e.target.value },
                })
              }
            />
            <Input
              type="time"
              className="mt-1"
              disabled={readOnly}
              value={body.signOff.rilTime}
              onChange={(e) =>
                patch({
                  signOff: { ...body.signOff, rilTime: e.target.value },
                })
              }
            />
          </div>
        </div>
        {!readOnly ? (
          <Button
            type="button"
            className="mt-3"
            size="sm"
            variant="secondary"
            onClick={() =>
              patch({
                signOff: {
                  safetyOfficerName: body.safetyOfficer || "Safety Officer",
                  safetyOfficerTime: new Date().toTimeString().slice(0, 5),
                  sicName: body.siteInCharge || "SIC",
                  sicTime: "",
                  rilName: body.rilEic || "RIL EIC",
                  rilTime: "",
                },
              })
            }
          >
            Mock sign (SO)
          </Button>
        ) : null}
      </Panel>
    </div>
  );
}
