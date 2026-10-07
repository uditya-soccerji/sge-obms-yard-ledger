import type { PaintLifecycleStage, RoleId, StaffMember } from "./types";
import type { DprSubmitterType } from "./types";

/** Ordered paint FIM kanban columns */
export const PAINT_STAGE_ORDER: PaintLifecycleStage[] = [
  "pr",
  "po",
  "ril_receive",
  "sge_receive",
  "issued",
  "consumed",
  "reco",
  "posted",
];

export const PAINT_STAGE_LABEL: Record<PaintLifecycleStage, string> = {
  pr: "PR",
  po: "PO",
  ril_receive: "RIL Store",
  sge_receive: "SGE Store",
  issued: "Issued to Supervisor",
  consumed: "Consumed via DPR",
  reco: "Reco",
  posted: "Posted 942 / 261",
};

export const PAINT_STAGE_HINT: Record<PaintLifecycleStage, string> = {
  pr: "Purchase requisition (RIL side start)",
  po: "Purchase order",
  ril_receive: "Received at RIL store",
  sge_receive: "Transferred / received into SGE store",
  issued: "SGE issues to supervisor — RIL movement 941",
  consumed: "Supervisor books consumption on painting/blasting DPR",
  reco: "Month-end reconciliation submitted to RIL",
  posted: "RIL posts consumption receipt — 942 after reco; 261 related",
};

/** Default DPR submitter type from role + supervisorType */
export function defaultDprSubmitterType(
  role: RoleId | null,
  staff: StaffMember | undefined
): DprSubmitterType {
  if (role === "store") return "store";
  if (role === "safety") return "safety";
  if (staff?.supervisorType === "scaffolding") return "scaffolding";
  if (staff?.supervisorType === "safety") return "safety";
  if (staff?.supervisorType === "painting_blasting") return "painting_blasting";
  if (role === "supervisor") return "painting_blasting";
  return "painting_blasting";
}

/**
 * Role-scoped DPR types visible on the desk / new form.
 * SIC / Owner / Admin / Super Admin see all. Supervisors & safety & store see only theirs.
 */
export function allowedDprSubmitterTypes(
  role: RoleId | null,
  staff: StaffMember | undefined
): DprSubmitterType[] | "all" {
  if (
    role === "sic" ||
    role === "owner" ||
    role === "admin" ||
    role === "super_admin" ||
    role === "hr" ||
    role === "finance"
  ) {
    return "all";
  }
  if (role === "store") return ["store"];
  if (role === "safety") return ["safety"];
  if (role === "supervisor") {
    const t = defaultDprSubmitterType(role, staff);
    return [t];
  }
  return "all";
}

export function canEditMovement941(stage: PaintLifecycleStage): boolean {
  return (
    stage === "issued" ||
    stage === "consumed" ||
    stage === "reco" ||
    stage === "posted"
  );
}

export function canEditMovement942261(stage: PaintLifecycleStage): boolean {
  return stage === "posted";
}
