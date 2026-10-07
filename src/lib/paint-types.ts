export type SchemeStatus = "ok" | "none" | "verify" | "disputed";

export interface PaintScheme {
  id: number;
  app: string;
  temp: string;
  prep: string;
  dft: number;
  status: SchemeStatus;
  remarks: string;
}

export interface CoatNorm {
  m: number;
  s: number;
  pos: string;
  p: string;
  dft: number;
  b: number | null;
  sp: number | null;
  sap: string;
  tsap: string;
}

export type AppMethod = "brush" | "spray";

export interface CoatResult {
  coat: CoatNorm;
  litres: number | null;
  thinner: number | null;
  manual: boolean;
}

export interface CalcResult {
  schemeId: number;
  area: number;
  method: AppMethod;
  contingencyPct: number;
  coats: CoatResult[];
  totalPaint: number | null;
  totalThinner: number | null;
  isNoNorm: boolean;
  status: SchemeStatus;
  flaggedForOwner: boolean;
}
