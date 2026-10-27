/**
 * RIL Maintenance Painting Schemes (MPS) with consumption norms — from the owner's
 * "MPS SYSTEM WITH PAINT NAME.pdf" and "MPS Paint with consumption and SAP code.xlsx" (2026-10-27).
 * Norms are L/m² per coat, brush and spray. Type 6 (PU finish) has one SAP / PTS code per shade.
 * Schemes with no norm in the sheet (e.g. MPS 7, 14–20, 26) are listed but can't be worked out.
 */
export type CoatName = "Stripe" | "First" | "Intermediate" | "Final";
export interface MpsCoat {
  coat: string;
  paint: string;
  type?: string;
  dft?: number;
  brush?: number;
  spray?: number;
  /** Paint SAP code; "by shade" = Type 6, pick the shade's code */
  sap?: string;
  thinner?: string;
}
export interface MpsScheme {
  mps: string;
  application: string;
  coats: MpsCoat[];
}

export const MPS_SCHEMES: MpsScheme[] = [
  { mps: "MPS 1", application: "General Carbon steel, Uninsulated, Structure, Light Poles", coats: [
    { coat: "First", paint: "Type 17 : High Build Epoxy surface tolerant paint", type: "T17", dft: 100, brush: 0.271, spray: 0.353, sap: "2002462162", thinner: "2001608671" },
    { coat: "Final", paint: "Type 6 : Aliphatic Acrylic Urethane Finish", type: "T6", dft: 50, brush: 0.139, spray: 0.18, sap: "by shade", thinner: "2000273111" },
  ] },
  { mps: "MPS 2", application: "General Carbon steel, Uninsulated, Structure", coats: [
    { coat: "First", paint: "Type 4 :Zinc Rich Epoxy Primer", type: "T4", dft: 75, brush: 0.237, spray: 0.308, sap: "2002462179", thinner: "2000982147" },
    { coat: "Intermediate", paint: "Type 5 : High Build MIO Epoxy Intermediate", type: "T5", dft: 175, brush: 0.387, spray: 0.503, sap: "2002462171", thinner: "2000183609" },
    { coat: "Final", paint: "Type 6 : Aliphatic Acrylic Urethane Finish", type: "T6", dft: 50, brush: 0.139, spray: 0.18, sap: "by shade", thinner: "2000273111" },
  ] },
  { mps: "MPS 3", application: "1). Flare line (Aro), and all flare lines , 2). Jetty Trustle, 3) Coke drum structure, 4). Highly corrosive area like coker due to atmospheric conditions, 5).non Insulated Piping under culvert", coats: [
    { coat: "First", paint: "Type 24 : Polyamine cured Glass Reinforced Epoxy", type: "T24", dft: 125, brush: 0.2885, spray: 0.375, sap: "2002462154", thinner: "2002491501" },
    { coat: "Intermediate", paint: "Type 22 : High Solids Modified Epoxy", type: "T22", dft: 350, brush: 0.974, spray: 1.266, sap: "2002462129", thinner: "2001608349" },
    { coat: "Final", paint: "Type 6 : Aliphatic Acrylic Urethane Finish", type: "T6", dft: 50, brush: 0.139, spray: 0.18, sap: "by shade", thinner: "2000273111" },
  ] },
  { mps: "MPS 4", application: "High temperature Piping, Equipment, Wind Girder- Insulated piping in Culvert", coats: [
    { coat: "First", paint: "Type 23 : High temperature high build inert multi-polymeric matrix coating or inorganic copolymer with aluminium flakes.", type: "T23", dft: 125, brush: 0.412, spray: 0.536, sap: "2002462128", thinner: "2001608375" },
    { coat: "Final", paint: "Type 23 : High temperature high build inert multi-polymeric matrix coating or inorganic copolymer with aluminium flakes.", type: "T23", dft: 125, brush: 0.412, spray: 0.536, sap: "2002462128", thinner: "2001608375" },
  ] },
  { mps: "MPS 5", application: "Cryogenic plant Piping and Structure, Sweating Line - Normal Application", coats: [
    { coat: "First", paint: "Type 24 : Polyamine cured Glass Reinforced Epoxy", type: "T24", dft: 125, brush: 0.2885, spray: 0.375, sap: "2002462154", thinner: "2002491501" },
    { coat: "Final", paint: "Type 24 : Polyamine cured Glass Reinforced Epoxy", type: "T24", dft: 125, brush: 0.2885, spray: 0.375, sap: "2002462154", thinner: "2002491501" },
  ] },
  { mps: "MPS 6", application: "High temperature Piping & Paints - furnaces, ducts , coker vessels etc.", coats: [
    { coat: "First", paint: "Type 2 : High Temperature Silicone Acrylic", type: "T2", dft: 25, brush: 0.147, spray: 0.19, sap: "2002462133", thinner: "2001193620" },
    { coat: "Intermediate", paint: "Type 2 : High Temperature Silicone Acrylic", type: "T2", dft: 25, brush: 0.147, spray: 0.19, sap: "2002462133", thinner: "2001193620" },
    { coat: "Final", paint: "Type 2 : High Temperature Silicone Acrylic", type: "T2", dft: 25, brush: 0.147, spray: 0.19, sap: "2002462133", thinner: "2001193620" },
  ] },
  { mps: "MPS 7", application: "Temeprature Indicating Paint", coats: [
    { coat: "First", paint: "Interzinc 22", type: undefined, dft: 60, brush: undefined, spray: undefined, sap: undefined, thinner: undefined },
    { coat: "Intermediate", paint: "Intertherm Modified Silicone (Intertherm 715)", type: undefined, dft: 25, brush: undefined, spray: undefined, sap: undefined, thinner: undefined },
    { coat: "Final", paint: "Intertherm Modified Silicone (Intertherm 715)", type: undefined, dft: 25, brush: undefined, spray: undefined, sap: undefined, thinner: undefined },
  ] },
  { mps: "MPS 8", application: "Storage Tank - Food grade paint", coats: [
    { coat: "First", paint: "Type 10A : Amine Adduct Cured Epoxy for drinking water", type: "T10A", dft: 200, brush: 0.932, spray: 1.212, sap: "2002462130", thinner: "2001098731" },
    { coat: "Final", paint: "Type 10A : Amine Adduct Cured Epoxy for drinking water", type: "T10A", dft: 200, brush: 0.932, spray: 1.212, sap: "2002462130", thinner: "2001098731" },
  ] },
  { mps: "MPS 9", application: "Storage Tank", coats: [
    { coat: "First", paint: "Type 10B : Amine Adduct Cured Epoxy", type: "T10B", dft: 100, brush: 0.385, spray: 0.5, sap: "2002462144", thinner: "2001098731" },
    { coat: "Intermediate", paint: "Type 10B : Amine Adduct Cured Epoxy", type: "T10B", dft: 100, brush: 0.385, spray: 0.5, sap: "2002462144", thinner: "2001098731" },
    { coat: "Final", paint: "Type 10B : Amine Adduct Cured Epoxy", type: "T10B", dft: 100, brush: 0.385, spray: 0.5, sap: "2002462144", thinner: "2001098731" },
  ] },
  { mps: "MPS 10", application: "Storage Tanks External Surface", coats: [
    { coat: "First", paint: "High solids Epoxy Resin Armacoat : Armamastic", type: undefined, dft: 210, brush: 0.793, spray: 1.02, sap: "2002473427", thinner: "2001608349" },
    { coat: "Intermediate", paint: "High solids Epoxy Resin Armacoat : Armamastic", type: undefined, dft: 210, brush: 0.793, spray: 1.02, sap: "2002473427", thinner: "2001608349" },
    { coat: "Final", paint: "High solids Epoxy Resin Armacoat : Armamastic", type: undefined, dft: 210, brush: 0.793, spray: 1.02, sap: "2002473427", thinner: "2001608349" },
  ] },
  { mps: "MPS 11", application: "Storage Tanks Intenal Condensate Tanks", coats: [
    { coat: "First", paint: "Type 18 : HB Epoxy Phenolic", type: "T18", dft: 100, brush: 0.385, spray: 0.5, sap: "2002462159", thinner: "2001101879" },
    { coat: "Intermediate", paint: "Type 18 : HB Epoxy Phenolic", type: "T18", dft: 100, brush: 0.385, spray: 0.5, sap: "2002462159", thinner: "2001101879" },
    { coat: "Final", paint: "Type 18 : HB Epoxy Phenolic", type: "T18", dft: 100, brush: 0.385, spray: 0.5, sap: "2002462159", thinner: "2001101879" },
  ] },
  { mps: "MPS 12", application: "Storage Tanks", coats: [
    { coat: "First", paint: "Type 9 : High solids, modified epoxy barrier coat suitable for single coat application.", type: "T9", dft: 150, brush: 0.371, spray: 0.482, sap: "2002462158", thinner: "2000937853" },
  ] },
  { mps: "MPS 13", application: "Storage Tanks", coats: [
    { coat: "First", paint: "Type 17 : High Build Epoxy surface tolerant paint", type: "T17", dft: 100, brush: 0.271, spray: 0.353, sap: "2002462162", thinner: "2001608671" },
    { coat: "Intermediate", paint: "Type 17 : High Build Epoxy surface tolerant paint", type: "T17", dft: 100, brush: 0.271, spray: 0.353, sap: "2002462162", thinner: "2001608671" },
    { coat: "Final", paint: "Type 6 : Aliphatic Acrylic Urethane Finish", type: "T6", dft: 50, brush: 0.139, spray: 0.18, sap: "by shade", thinner: "2000273111" },
  ] },
  { mps: "MPS 14", application: "PCG - Storage Tank (Internal)", coats: [
    { coat: "First", paint: "Polycyclamine cured lining system ENVIROLINE 405HTR", type: undefined, dft: 750, brush: undefined, spray: undefined, sap: undefined, thinner: undefined },
  ] },
  { mps: "MPS 15", application: "PCG - Storage Tank (Internal)", coats: [
    { coat: "First", paint: "Vinyl ester Resin Ceilcote 380", type: undefined, dft: 100, brush: undefined, spray: undefined, sap: undefined, thinner: undefined },
    { coat: "Intermediate", paint: "Vinyl ester Resin Ceilcote 242AR Flakeline", type: undefined, dft: 375, brush: undefined, spray: undefined, sap: undefined, thinner: undefined },
    { coat: "Final", paint: "Vinyl ester Resin Ceilcote 242AR Flakeline", type: undefined, dft: 375, brush: undefined, spray: undefined, sap: undefined, thinner: undefined },
  ] },
  { mps: "MPS 16", application: "C2 Storage Tank (Internal)", coats: [
    { coat: "First", paint: "Ceilcote 680M", type: undefined, dft: 100, brush: undefined, spray: undefined, sap: undefined, thinner: undefined },
    { coat: "Intermediate", paint: "Ceilcote 505", type: undefined, dft: 750, brush: undefined, spray: undefined, sap: undefined, thinner: undefined },
    { coat: "Final", paint: "Ceilcote 505", type: undefined, dft: 750, brush: undefined, spray: undefined, sap: undefined, thinner: undefined },
  ] },
  { mps: "MPS 17", application: "Underground Piping Coating", coats: [
    { coat: "First", paint: "Type 19A : Polyester Glass Flake Polymer Coating", type: "T19A", dft: 700, brush: undefined, spray: undefined, sap: undefined, thinner: undefined },
  ] },
  { mps: "MPS 18", application: "Underground Piping Coating", coats: [
    { coat: "First", paint: "Type 19B : Glass Flake Vinyl ester acrylic co-polymer coating", type: "T19B", dft: 700, brush: undefined, spray: undefined, sap: undefined, thinner: undefined },
  ] },
  { mps: "MPS 19", application: "Underground Piping Coating (for Repair)", coats: [
    { coat: "First", paint: "High Build Epoxy", type: undefined, dft: 1000, brush: undefined, spray: undefined, sap: undefined, thinner: undefined },
  ] },
  { mps: "MPS 20", application: "Underground Piping Coating (For Repair)", coats: [
    { coat: "First", paint: "High Build Epoxy", type: undefined, dft: 1000, brush: undefined, spray: undefined, sap: undefined, thinner: undefined },
  ] },
  { mps: "MPS 21", application: "PU Painting FIRE EXTINGUISHER", coats: [
    { coat: "First", paint: "Type 6 : Aliphatic Acrylic Urethane Finish", type: "T6", dft: 50, brush: 0.139, spray: 0.18, sap: "by shade", thinner: "2000273111" },
    { coat: "Final", paint: "Type 6 : Aliphatic Acrylic Urethane Finish", type: "T6", dft: 50, brush: 0.139, spray: 0.18, sap: "by shade", thinner: "2000273111" },
  ] },
  { mps: "MPS 22", application: "Aggressive corrosion areas - General Application for Electrical / Instrument", coats: [
    { coat: "First", paint: "Type 17 : High Build Epoxy surface tolerant paint", type: "T17", dft: 100, brush: 0.271, spray: 0.353, sap: "2002462162", thinner: "2001608671" },
    { coat: "Final", paint: "Type 6 : Aliphatic Acrylic Urethane Finish", type: "T6", dft: 50, brush: 0.139, spray: 0.18, sap: "by shade", thinner: "2000273111" },
  ] },
  { mps: "MPS 23", application: "Normal Painting - General Application for Electrical / Instrument", coats: [
    { coat: "Final", paint: "Type 6 : Aliphatic Acrylic Urethane Finish", type: "T6", dft: 50, brush: 0.139, spray: 0.18, sap: "by shade", thinner: "2000273111" },
  ] },
  { mps: "MPS 24", application: "Electrical Transformer", coats: [
    { coat: "First", paint: "Type 24 : Polyamine cured Glass Reinforced Epoxy", type: "T24", dft: 125, brush: 0.2885, spray: 0.375, sap: "2002462154", thinner: "2002491501" },
    { coat: "Final", paint: "Type 6 : Aliphatic Acrylic Urethane Finish", type: "T6", dft: 50, brush: 0.139, spray: 0.18, sap: "by shade", thinner: "2000273111" },
  ] },
  { mps: "MPS 25", application: "Tanks - Camouflaging painting as per security Guidelines", coats: [
    { coat: "First", paint: "Type 6 : Aliphatic Acrylic Urethane Finish", type: "T6", dft: 50, brush: 0.139, spray: 0.18, sap: "by shade", thinner: "2000273111" },
    { coat: "Intermediate", paint: "Type 6 : Aliphatic Acrylic Urethane Finish", type: "T6", dft: 50, brush: 0.139, spray: 0.18, sap: "by shade", thinner: "2000273111" },
    { coat: "Final", paint: "Type 6 : Aliphatic Acrylic Urethane Finish", type: "T6", dft: 50, brush: 0.139, spray: 0.18, sap: "by shade", thinner: "2000273111" },
  ] },
  { mps: "MPS 26", application: "Letter writing as per EIC", coats: [
    { coat: "Final", paint: "Synthetic enamel paint", type: undefined, dft: 25, brush: undefined, spray: undefined, sap: undefined, thinner: undefined },
  ] },
  { mps: "MPS 27", application: "Flare line painting", coats: [
    { coat: "First", paint: "Type 23 : High temperature high build inert multi-polymeric matrix coating or inorganic copolymer with aluminium flakes.", type: "T23", dft: 125, brush: 0.412, spray: 0.536, sap: "2002462128", thinner: "2001608375" },
    { coat: "Intermediate", paint: "Type 3: High Temperature Silicone Aluminium", type: "T3", dft: 25, brush: 0.0874, spray: 0.1136, sap: "2002462132", thinner: "2001116135" },
    { coat: "Final", paint: "Type 3: High Temperature Silicone Aluminium", type: "T3", dft: 25, brush: 0.0874, spray: 0.1136, sap: "2002462132", thinner: "2001116135" },
  ] },
  { mps: "MPS 28", application: "Jetty Pipelines & associated structures", coats: [
    { coat: "Stripe", paint: "Type 24 : Surface Tolerant for moist surface/CUI/as well as all other surface universal usage", type: "T24", dft: 100, brush: 0.2885, spray: 0.375, sap: "2002462154", thinner: "2002491501" },
    { coat: "First", paint: "Type 24 : Surface Tolerant for moist surface/CUI/as well as all other surface universal usage", type: "T24", dft: 100, brush: 0.2885, spray: 0.375, sap: "2002462154", thinner: "2002491501" },
    { coat: "Intermediate", paint: "Type 25: High Build Epoxy for Marine Splash and Immersion service", type: "T25", dft: 200, brush: 0.974, spray: 1.27, sap: "2002462116", thinner: "2002483370" },
    { coat: "Final", paint: "Type 6: Aliphatic Urethane finish", type: "T6", dft: 50, brush: 0.139, spray: 0.18, sap: "by shade", thinner: "2000273111" },
  ] },
  { mps: "MPS 29", application: "Jetty Piles & Jacket Structures", coats: [
    { coat: "Stripe", paint: "Type 24 : Surface Tolerant for moist surface/CUI/as well as all other surface universal usage", type: "T24", dft: 100, brush: 0.2885, spray: 0.375, sap: "2002462154", thinner: "2002491501" },
    { coat: "First", paint: "Type 24 : Surface Tolerant for moist surface/CUI/as well as all other surface universal usage", type: "T24", dft: 500, brush: 0.2885, spray: 0.375, sap: "2002462154", thinner: "2002491501" },
  ] },
];

/** Type 6 Aliphatic Acrylic Urethane finish — one code per shade */
export const TYPE6_SHADES: { shade: string; code: string }[] = [
  { shade: "Beige", code: "P0FHGAARBGE" },
  { shade: "Black", code: "P0FHGAARBLK" },
  { shade: "Blue", code: "P0FHGAARBLU" },
  { shade: "Brown", code: "P0FHGAARBWN" },
  { shade: "Charcoal/Char.Grey", code: "P0FHGAARCGY" },
  { shade: "Cream", code: "P0FHGAARCM1" },
  { shade: "Cream", code: "P0FHGAARCM2" },
  { shade: "Crimson", code: "P0FHGAARCRM" },
  { shade: "Emerald Green", code: "P0FHGAAREGN" },
  { shade: "Fire Red", code: "P0FHGAARFIR" },
  { shade: "Golden Yellow", code: "P0FHGAARGYW" },
  { shade: "Green", code: "P0FHGAARGR1" },
  { shade: "Green", code: "P0FHGAARGR2" },
  { shade: "Green Yellow", code: "P0FHGAARGY1" },
  { shade: "Green Yellow", code: "P0FHGAARGY2" },
  { shade: "Green Yellow/Lt.Green", code: "P0FHGAARLGN" },
  { shade: "Green/Dark Green", code: "P0FHGAARDGN" },
  { shade: "Lt. Blue", code: "P0FHGAARLBL" },
  { shade: "Lt. Grey", code: "P0FHGAARLGY" },
  { shade: "Orange", code: "P0FHGAARORG" },
  { shade: "Pale Green", code: "P0FHGAARPGN" },
  { shade: "Purple", code: "P0FHGAARPU1" },
  { shade: "Purple", code: "P0FHGAARPU2" },
  { shade: "Purple Blue", code: "P0FHGAARPUB" },
  { shade: "Red Purple", code: "P0FHGAARRPU" },
  { shade: "Salmon Pink/Pink", code: "P0FHGAARSPK" },
  { shade: "Sea Green", code: "P0FHGAARSGN" },
  { shade: "Sky Blue", code: "P0FHGAARSBL" },
  { shade: "Violet", code: "P0FHGAARVT1" },
  { shade: "Violet", code: "P0FHGAARVT2" },
  { shade: "White", code: "P0FHGAARWHT" },
  { shade: "Yellow", code: "P0FHGAARYM1" },
  { shade: "Yellow", code: "P0FHGAARYM2" },
  { shade: "Yellow", code: "P0FHGAARYM3" },
  { shade: "Yellow", code: "P0FHGAARYM4" },
  { shade: "Yellow", code: "P0FHGAARYM5" },
];

/** Thinner is 10% of paint consumption (sheet remark) */
export const THINNER_SHARE = 0.1;
/** A DPR line's litres more than this far from the norm are flagged */
export const NORM_TOLERANCE = 0.1;

export type Method = "brush" | "spray";

/** "MPS-1", "mps 1", "MPS1" → "MPS 1" */
export function mpsKey(s: string | undefined): string {
  const n = String(s ?? "").match(/(\d+)/)?.[1];
  return n ? `MPS ${Number(n)}` : "";
}

export function schemeOf(mps: string | undefined): MpsScheme | undefined {
  const k = mpsKey(mps);
  return MPS_SCHEMES.find((s) => s.mps === k);
}

/** The coat a DPR stage paints: 1st coat → First, 2nd coat → Intermediate, Final shade → Final */
export function coatForStage(stage: string): CoatName | null {
  return stage === "coat1" ? "First" : stage === "coat2" ? "Intermediate" : stage === "final" ? "Final" : null;
}

/** The norm (L/m²) for an MPS coat by method; null when the sheet has none */
export function normFor(mps: string | undefined, stage: string, method: Method): { norm: number; coat: MpsCoat } | null {
  const coatName = coatForStage(stage);
  const coat = schemeOf(mps)?.coats.find((c) => c.coat === coatName);
  const norm = coat?.[method];
  return coat && norm ? { norm, coat } : null;
}

/** The SAP code a coat draws from: its own, or the chosen Type 6 shade */
export const coatSap = (c: MpsCoat, type6Code: string) => (c.sap === "by shade" ? type6Code : c.sap);

export interface Achievable {
  mps: string;
  application: string;
  /** null = the sheet has no norm for a coat */
  m2: number | null;
  limitedBy?: string;
  /** L/m² needed per paint (coats of the same paint added) */
  perPaint: { sap: string; paint: string; perM2: number; stock: number }[];
  thinnerL: number;
}

/** How many m² of a scheme the stock can do, if it all went to that scheme */
export function achievable(s: MpsScheme, stockBySap: (sap: string) => number, method: Method, type6Code: string): Achievable {
  const need = new Map<string, { paint: string; perM2: number }>();
  for (const c of s.coats) {
    const n = c[method];
    const sap = coatSap(c, type6Code);
    if (!n || !sap) return { mps: s.mps, application: s.application, m2: null, perPaint: [], thinnerL: 0 };
    const was = need.get(sap);
    need.set(sap, { paint: c.paint.split(":")[0].trim(), perM2: (was?.perM2 ?? 0) + n });
  }
  const perPaint = [...need.entries()].map(([sap, v]) => ({ sap, paint: v.paint, perM2: Math.round(v.perM2 * 10000) / 10000, stock: stockBySap(sap) }));
  if (!perPaint.length) return { mps: s.mps, application: s.application, m2: null, perPaint, thinnerL: 0 };
  let m2 = Infinity;
  let limitedBy = "";
  for (const p of perPaint) {
    const a = p.stock / p.perM2;
    if (a < m2) { m2 = a; limitedBy = p.paint; }
  }
  const total = perPaint.reduce((t, p) => t + p.perM2, 0);
  return { mps: s.mps, application: s.application, m2: Math.round(m2 * 10) / 10, limitedBy, perPaint, thinnerL: Math.round(total * m2 * THINNER_SHARE * 10) / 10 };
}
