"use client";

import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Boxes,
  Calculator,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Eye,
  FileText,
  Fingerprint,
  HandCoins,
  HardHat,
  History,
  Home,
  IdCard,
  Inbox,
  LayoutGrid,
  Megaphone,
  Package,
  PaintRoller,
  Receipt,
  Ruler,
  Send,
  ShieldAlert,
  ShieldCheck,
  Upload,
  Users,
  Wallet,
  Wrench,
  Database,
  Briefcase,
} from "lucide-react";
import type { OpsPanelId, TopNavId } from "./desk";
import { opsPillsFor } from "./desk";
import { ALL_SITES } from "./site-scope";
import { useStore } from "./store";
import { changeBadgeCount } from "./wage-requests";
import { today } from "./today";
import { useWork } from "./work/store";

/** One icon per Operations tab, so each is easy to spot (2026-10-24) */
export const PANEL_ICON: Record<OpsPanelId, LucideIcon> = {
  dpr: ClipboardList,
  store: Package,
  safety: ShieldCheck,
  approvals: ClipboardCheck,
  crew: Users,
  acpl: Fingerprint,
  jms: FileText,
  finance: Wallet,
  hr: CalendarDays,
  requests: Inbox,
  labourers: HardHat,
  staff: IdCard,
  "labour-pay": Banknote,
  observations: ShieldAlert,
  "safety-view": Eye,
  equipment: Wrench,
  "my-equipment": Boxes,
  "vendor-bills": Receipt,
  advances: HandCoins,
  leave: CalendarDays,
  submissions: Send,
  audit: History,
  admin: Upload,
  "paint-calc": PaintRoller,
  "area-calc": Ruler,
  "scaffold-calc": LayoutGrid,
  estimate: Calculator,
  telegram: Megaphone,
};

export const NAV_ICON: Record<TopNavId, LucideIcon> = {
  home: Home,
  work: Briefcase,
  operations: LayoutGrid,
  master: Database,
};

export type QueueCounts = {
  /** Waiting on this role, per Operations tab — the same rows that tab lists as needing action */
  ops: Partial<Record<OpsPanelId, number>>;
  nav: Partial<Record<TopNavId, number>>;
  /** Plan line requests for Work → Plan */
  plan: number;
};

/**
 * What is waiting for the signed-in role, counted the way each page lists it
 * (same site filter as the page: the active site, or every site on "All sites").
 * Owner / Super Admin see the sum of every role's queue. (2026-10-24, rules §29)
 */
export function useQueueCounts(): QueueCounts {
  const { state, fullState, currentAccount } = useStore();
  const { work } = useWork();
  const role = state.currentRole;
  const boss = role === "owner" || role === "super_admin";
  const me = state.currentUserId;
  const inSite = (siteId: string | undefined) => state.currentSiteId === ALL_SITES || !siteId || siteId === state.currentSiteId;
  const has = (...roles: string[]) => boss || (role != null && roles.includes(role));
  const ops: QueueCounts["ops"] = {};
  const put = (id: OpsPanelId, n: number) => {
    if (n > 0) ops[id] = (ops[id] ?? 0) + n;
  };

  // DPR approvals: submitted reports wait for the SIC (Admin checks quantities on the same page)
  if (has("sic", "admin")) put("approvals", work.reports.filter((r) => r.status === "submitted" && inSite(r.siteId)).length);
  // DPR desk: my report was sent back — fix and resubmit
  if (me) put("dpr", work.reports.filter((r) => r.status === "sic_rejected" && r.submitterId === me && inSite(r.siteId)).length);
  // Crews: the giving supervisor releases, then the SIC approves
  const crew = fullState.crewRequests.filter((r) => inSite(r.siteId));
  if (has("sic")) put("crew", crew.filter((r) => r.status === "requested" || r.status === "released").length);
  else if (role === "supervisor" && me) put("crew", crew.filter((r) => r.status === "requested" && r.fromSupervisorId === me).length);
  // Store requests: the store fulfils or rejects; the SIC overrides a rejection; the asker confirms receipt
  const reqs = fullState.equipmentRequests.filter((r) => inSite(r.siteId));
  if (has("store")) put("requests", reqs.filter((r) => r.status === "open" || r.status === "sic_approved" || r.status === "fulfilling").length);
  if (has("sic")) put("requests", reqs.filter((r) => r.status === "rejected").length);
  if (!boss && me) put("requests", reqs.filter((r) => r.createdBy === me && (r.status === "fulfilled" || r.status === "part_filled")).length);
  // Store returns wait for the store
  if (has("store")) put("equipment", fullState.equipmentReturns.filter((r) => r.status === "with_store" && inSite(r.siteId)).length);
  // Leave asked for waits for HR
  if (has("hr")) put("leave", fullState.leaves.filter((e) => e.status === "requested").length);
  // Safety observations: open waits for the supervisor, fixed waits for Safety to close
  const obs = fullState.safetyObservations.filter((o) => inSite(o.siteId));
  if (has("safety")) put("observations", obs.filter((o) => o.status === "fixed" || (boss && o.status === "open")).length);
  // Finance: alerts not yet acknowledged; vendor bills due today or overdue
  if (has("finance")) {
    put("finance", fullState.financeAlerts.filter((a) => !a.acknowledged && inSite(a.siteId)).length);
    const t = today();
    put("vendor-bills", fullState.vendorBills.filter((b) => b.status === "unpaid" && !!b.dueDate && b.dueDate <= t && inSite(b.siteId)).length);
  }
  // JMS waiting for the Admin's RIL number and amount
  if (has("admin")) {
    const siteOfLine = (id: string) => work.planLines.find((l) => l.id === id)?.siteId;
    put("jms", work.jms.filter((j) => j.adminStatus === "pending_admin" && inSite(siteOfLine(j.planLineId))).length);
  }

  // Only tabs this role actually has
  const mine = new Set(opsPillsFor(currentAccount, role).map((p) => p.id));
  for (const k of Object.keys(ops) as OpsPanelId[]) if (!mine.has(k)) delete ops[k];

  // Plan lines the Admin asked for: the site's SIC (and Owner / SA) decide; the Admin sees new decisions
  const planWaiting = work.planRequests.filter((r) => r.status === "pending" && inSite(r.siteId) && (boss || (role === "sic" && (currentAccount?.siteIds ?? []).includes(r.siteId)))).length;
  const planNew = role === "admin" ? work.planRequests.filter((r) => (r.status === "approved" || r.status === "rejected") && !r.seenByRequester && r.requestedBy === (me ?? state.currentAccountId)).length : 0;
  const plan = planWaiting + planNew;

  const nav: QueueCounts["nav"] = {};
  if (plan) nav.work = plan;
  const opsTotal = Object.values(ops).reduce((s, n) => s + (n ?? 0), 0);
  if (opsTotal) nav.operations = opsTotal;
  const master = changeBadgeCount(fullState);
  if (master) nav.master = master;
  return { ops, nav, plan };
}
