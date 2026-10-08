/** Catalog / register rows scoped site-first, then company-wide (`siteId` null). */

export type MasterSheetId =
  | "sites"
  | "users"
  | "labourers"
  | "contractors"
  | "trades"
  | "dprTypes"
  | "activityTemplates"
  | "units"
  | "materials"
  | "storeBooks"
  | "fimStages"
  | "rateBook"
  | "safetyFormCodes"
  | "shiftTypes"
  | "attendanceStatuses";

export interface CatalogItem {
  id: string;
  /** null = company-wide */
  siteId: string | null;
  code: string;
  label: string;
  active: boolean;
  note?: string;
}

export interface MaterialItem extends CatalogItem {
  sapCode: string;
  paintSystem: string;
  uom: string;
}

export interface Contractor {
  id: string;
  siteId: string | null;
  code: string;
  name: string;
  gstin?: string;
  active: boolean;
}

export interface MasterCatalog {
  contractors: Contractor[];
  dprTypes: CatalogItem[];
  activityTemplates: CatalogItem[];
  units: CatalogItem[];
  materials: MaterialItem[];
  storeBooks: CatalogItem[];
  fimStages: CatalogItem[];
  safetyFormCodes: CatalogItem[];
  shiftTypes: CatalogItem[];
  attendanceStatuses: CatalogItem[];
}

export const MASTER_SHEETS: {
  id: MasterSheetId;
  label: string;
  hint: string;
}[] = [
  { id: "sites", label: "Sites", hint: "Operating sites and plants" },
  { id: "users", label: "Users / seats", hint: "Logins, roles, assigned sites" },
  { id: "labourers", label: "Labourers", hint: "Register — contractor required" },
  { id: "contractors", label: "Contractors", hint: "Labour contractor firms" },
  { id: "trades", label: "Trades", hint: "Labour trades and sub-categories" },
  { id: "dprTypes", label: "DPR types", hint: "What New DPR can pick" },
  {
    id: "activityTemplates",
    label: "Activity templates",
    hint: "Work lines on a DPR",
  },
  { id: "units", label: "Units of measure", hint: "m², L, man-day, …" },
  {
    id: "materials",
    label: "Materials",
    hint: "Paint system + SAP code on one row",
  },
  { id: "storeBooks", label: "Store books", hint: "941 / 942 / 261 movement books" },
  { id: "fimStages", label: "FIM stages", hint: "Paint lifecycle columns" },
  { id: "rateBook", label: "Rate book / PO", hint: "Versioned PO rates" },
  { id: "safetyFormCodes", label: "Safety form codes", hint: "e.g. F/HSE/008" },
  { id: "shiftTypes", label: "Shift types", hint: "Codes only" },
  {
    id: "attendanceStatuses",
    label: "Attendance statuses",
    hint: "Codes only",
  },
];
