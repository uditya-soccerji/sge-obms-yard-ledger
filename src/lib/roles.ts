import type { RoleId } from "./types";
import type { UserAccount } from "./types";

export interface RoleMeta {
  id: RoleId;
  label: string;
  short: string;
  blurb: string;
  home: string;
  accent: string;
}

export const ROLES: RoleMeta[] = [
  {
    id: "super_admin",
    label: "Super Admin",
    short: "SA",
    blurb: "Users & rights, all modules, full audit log.",
    home: "/home",
    accent: "bg-[var(--sge-accent)]",
  },
  {
    id: "owner",
    label: "Owner",
    short: "Owner",
    blurb: "Daily gist, SIC pending, ACPL flags, JMS ratings, finance alerts, audit log.",
    home: "/home",
    accent: "bg-[var(--sge-accent)]",
  },
  {
    id: "sic",
    label: "Site InCharge (SIC)",
    short: "SIC",
    blurb: "DPR approval inbox, JMS verification, site POC for RIL.",
    home: "/home",
    accent: "bg-[var(--sge-steel)]",
  },
  {
    id: "admin",
    label: "Admin",
    short: "Admin",
    blurb: "Excel upload & data entry — ACPL, JMS, rates, master labour.",
    home: "/home",
    accent: "bg-[var(--sge-slate)]",
  },
  {
    id: "hr",
    label: "HR",
    short: "HR",
    blurb: "Attendance, ACPL match resolve, labourer & staff registers.",
    home: "/home",
    accent: "bg-[var(--sge-slate)]",
  },
  {
    id: "finance",
    label: "Finance",
    short: "Fin",
    blurb: "JMS payments, wage ledger, OT/advances, anomaly flags to SIC.",
    home: "/home",
    accent: "bg-[var(--sge-ok)]",
  },
  {
    id: "supervisor",
    label: "Supervisor",
    short: "Supv",
    blurb: "Painting/Blasting or Scaffolding DPR — labour, equipment, plan.",
    home: "/home",
    accent: "bg-[var(--sge-accent)]",
  },
  {
    id: "store",
    label: "Store Keeper",
    short: "Store",
    blurb: "Store DPR + paint FIM PR→PO→store→issue (941)→consume→reco→942/261.",
    home: "/home",
    accent: "bg-[var(--sge-steel)]",
  },
  {
    id: "safety",
    label: "Safety Supervisor",
    short: "Safety",
    blurb: "Safety DPR (F/HSE/008) — observations, checklist, permits, sign-off.",
    home: "/home",
    accent: "bg-[var(--sge-warn)]",
  },
  {
    id: "labourer",
    label: "Labourer",
    short: "Labour",
    blurb: "Own profile — EP/gate pass, trade, attendance, equipment, wages.",
    home: "/home",
    accent: "bg-[var(--sge-ok)]",
  },
];

export function roleMeta(id: RoleId) {
  return ROLES.find((r) => r.id === id)!;
}

export function rolesForSwitcher(account: UserAccount | null | undefined): RoleMeta[] {
  if (!account) return [];
  return ROLES.filter((r) => account.roles.includes(r.id));
}
