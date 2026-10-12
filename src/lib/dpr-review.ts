/**
 * Who reviewed a DPR, and for whom (docs §5, B04): Admin may approve the work
 * quantities on the SIC's behalf; the record and the log name both people.
 */
import type { DprDocument, RoleId, StaffMember, UserAccount } from "./types";

export type DprReviewedAs = NonNullable<DprDocument["reviewedAs"]>;

/** The SIC of a site: a SIC staff record on the site, else a SIC login covering it. */
export function siteSicId(
  staff: Pick<StaffMember, "id" | "role" | "siteId">[],
  users: Pick<UserAccount, "roles" | "siteIds" | "staffId" | "active">[],
  siteId: string
): string | undefined {
  const onSite = staff.find((s) => s.role === "sic" && s.siteId === siteId);
  if (onSite) return onSite.id;
  return users.find((u) => u.active && u.roles.includes("sic") && u.siteIds.includes(siteId) && u.staffId)?.staffId;
}

/** In what capacity the current role reviews: Admin acts for the SIC. */
export function reviewedAsFor(role: RoleId | null | undefined): DprReviewedAs {
  if (role === "admin") return "admin_for_sic";
  if (role === "owner") return "owner";
  if (role === "super_admin") return "super_admin";
  return "sic";
}

const AS_LABEL: Record<DprReviewedAs, string> = {
  sic: "SIC",
  admin_for_sic: "Admin",
  owner: "Owner",
  super_admin: "Super Admin",
};

/**
 * The bell event for a review (§19 tell the submitter; B04 tell the SIC when
 * Admin acted for them). Pure: the screens pass it to the Work store's notify().
 */
export function reviewEvent(input: {
  doc: Pick<DprDocument, "id" | "date" | "plant" | "siteId" | "submitterId">;
  decision: "sic_approved" | "sic_rejected";
  note: string;
  reviewerStaffId: string;
  role: RoleId | null | undefined;
  staff: Pick<StaffMember, "id" | "name" | "role" | "siteId">[];
  users: Pick<UserAccount, "roles" | "siteIds" | "staffId" | "active">[];
}) {
  const reviewedAs = reviewedAsFor(input.role);
  const onBehalfOf = reviewedAs === "admin_for_sic" ? siteSicId(input.staff, input.users, input.doc.siteId) : undefined;
  const nameOf = (id: string) => input.staff.find((s) => s.id === id)?.name ?? id;
  const line = reviewLine(
    { status: input.decision, sicReviewedBy: input.reviewerStaffId, reviewedAs, reviewedOnBehalfOf: onBehalfOf },
    nameOf
  );
  return {
    kind: "dpr_reviewed" as const,
    siteId: input.doc.siteId,
    subjectStaffId: input.doc.submitterId,
    alsoStaffId: onBehalfOf,
    // A send-back is a problem for the Owner's filter (§19)
    problem: input.decision === "sic_rejected",
    title: `DPR ${input.doc.date} · ${input.doc.plant || "—"} ${input.decision === "sic_approved" ? "approved" : "sent back"}`,
    detail: [line, input.note.trim()].filter(Boolean).join(" · "),
    tab: `/dpr/${input.doc.id}`,
    refId: input.doc.id,
  };
}

/** e.g. "Approved by N. Sharma (Admin) on behalf of R. Mehta (SIC)". */
export function reviewLine(
  doc: Pick<DprDocument, "status" | "sicReviewedBy" | "reviewedAs" | "reviewedOnBehalfOf">,
  nameOf: (staffId: string) => string
): string | null {
  if (!doc.sicReviewedBy || (doc.status !== "sic_approved" && doc.status !== "sic_rejected")) return null;
  const verb = doc.status === "sic_approved" ? "Approved" : "Sent back";
  const as = doc.reviewedAs ?? "sic";
  const who = `${nameOf(doc.sicReviewedBy)} (${AS_LABEL[as]})`;
  const forWhom =
    as === "admin_for_sic" ? ` on behalf of ${doc.reviewedOnBehalfOf ? `${nameOf(doc.reviewedOnBehalfOf)} (SIC)` : "the SIC"}` : "";
  return `${verb} by ${who}${forWhom}`;
}
