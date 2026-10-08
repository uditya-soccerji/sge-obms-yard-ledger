import type { CatalogItem, Contractor, MasterCatalog, MaterialItem } from "./types";

function company(
  id: string,
  code: string,
  label: string,
  extra?: Partial<CatalogItem>
): CatalogItem {
  return { id, siteId: null, code, label, active: true, ...extra };
}

/** Hub paint-type master (sheet 10) — type + SAP on one material row. */
const HUB_MATERIALS: MaterialItem[] = [
  ["Type 1", "Inorganic Zn silicate primer", "Carbozinc 11 E", "—"],
  ["Type 2", "High temperature silicone acrylic", "Termaline 4900", "2002462133"],
  ["Type 3", "High temperature silicone aluminium", "Intertherm 50", "2002462132"],
  ["Type 4", "Zn rich epoxy primer", "Carbozinc 858", "2002462179"],
  ["Type 5", "High build MIO epoxy intermediate", "Carboguard 893 MIO", "2002462171"],
  ["Type 6", "Aliphatic acrylic urethane finish", "Carbothane 134 HG", "by shade"],
  ["Type 9", "Tank bottom exterior soil side — HB epoxy", "Interzone 954", "2002462158"],
  ["Type 10A", "Amine adduct cure epoxy for drinking water", "Interline 925", "2002462130"],
  ["Type 10B", "Amine adduct cure epoxy", "Interline 1012", "2002462144"],
  ["Type 17", "High build epoxy surface tolerant", "Carbomastic 615 E", "2002462162"],
  ["Type 18", "High build epoxy phenolic", "Intershield 300", "2002462159"],
  ["Type 22", "High solids modified epoxy", "Carboguard 690 GF", "2002462129"],
  ["Type 23", "HT high build inert multipolymeric matrix", "Interbond 1202 UPC", "2002462128"],
  ["Type 24", "Surface tolerant — moist / CUI / universal", "Interplus 256", "2002462154"],
  ["Type 25", "High build epoxy, marine splash and immersion", "Carboguard 690 GF", "2002462116"],
].map(([code, label, paintSystem, sapCode], i) => ({
  id: `mat-${i + 1}`,
  siteId: null,
  code,
  label,
  paintSystem,
  sapCode: sapCode === "—" ? "" : sapCode,
  uom: "L",
  active: true,
}));

export const SEED_CONTRACTORS: Contractor[] = [
  {
    id: "con-sge",
    siteId: null,
    code: "SGE",
    name: "Shree Gayatri Enterprise (own)",
    active: true,
  },
  {
    id: "con-sub-a",
    siteId: "site-dta",
    code: "SUB-A",
    name: "Subcontractor A — painting crew",
    gstin: "24AAAAA0000A1Z5",
    active: true,
  },
];

export function seedMasterCatalog(): MasterCatalog {
  return {
    contractors: SEED_CONTRACTORS,
    dprTypes: [
      company("dt-paint", "painting_blasting", "Painting & blasting"),
      company("dt-scaf", "scaffolding", "Scaffolding"),
      company("dt-safety", "safety", "Safety (F/HSE/008)"),
      company("dt-store", "store", "Store / inventory"),
    ],
    activityTemplates: [
      company("act-paint", "painting", "Painting (m²)"),
      company("act-blast", "blasting", "Blasting (m²)"),
      company("act-erect", "scaffold_erect", "Scaffold erect (m³)"),
      company("act-dism", "scaffold_dismantle", "Scaffold dismantle (m³)"),
      company("act-issue", "store_issue", "Store issue"),
      company("act-obs", "safety_obs", "Safety observation"),
    ],
    units: [
      company("u-m2", "m2", "Square metre"),
      company("u-m3", "m3", "Cubic metre"),
      company("u-l", "L", "Litre"),
      company("u-nos", "nos", "Numbers"),
      company("u-md", "man-day", "Man-day"),
      company("u-inr", "INR", "Indian rupee"),
    ],
    materials: HUB_MATERIALS,
    storeBooks: [
      company("sb-941", "941", "RIL paint issue movement", {
        note: "Editable when issue runs — not a SAP material code",
      }),
      company("sb-942", "942", "Consumption after reco to RIL"),
      company("sb-261", "261", "Related RIL posting"),
    ],
    fimStages: [
      company("fim-pr", "pr", "PR"),
      company("fim-po", "po", "PO"),
      company("fim-ril", "ril_receive", "RIL Store"),
      company("fim-sge", "sge_receive", "SGE Store"),
      company("fim-iss", "issued", "Issued to Supervisor"),
      company("fim-con", "consumed", "Consumed via DPR"),
      company("fim-reco", "reco", "Reco"),
      company("fim-post", "posted", "Posted 942 / 261"),
    ],
    safetyFormCodes: [
      company("sf-008", "F/HSE/008", "Daily safety DPR", {
        note: "Observations, checklist, permits, sign-off",
      }),
    ],
    shiftTypes: [
      company("sh-gen", "Gen", "General"),
      company("sh-a", "A", "Shift A"),
      company("sh-b", "B", "Shift B"),
      company("sh-c", "C", "Shift C"),
    ],
    attendanceStatuses: [
      company("as-p", "present", "Present"),
      company("as-a", "absent", "Absent"),
      company("as-h", "half", "Half day"),
      company("as-l", "leave", "Leave"),
      company("as-o", "off", "Off"),
    ],
  };
}
