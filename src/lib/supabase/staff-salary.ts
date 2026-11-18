/**
 * Staff monthly salary (migration 20261118_014, owner 2026-11-18): one row per staff member
 * per month from the monthly staff salary sheet. Readable by Owner, Super Admin, HR and Finance
 * only (row-level security) — nobody else ever receives these rows.
 */
import { supabase } from "./client";
import type { RoleId } from "../types";

export const SALARY_ROLES: RoleId[] = ["owner", "super_admin", "hr", "finance"];

export interface StaffSalary {
  id: string;
  staffId: string;
  month: string;
  epNumber?: string;
  name: string;
  designation?: string;
  category?: string;
  sheetSite?: string;
  monthlyRate?: number;
  presentDays?: number;
  otHours?: number;
  perDayRate?: number;
  perOtRate?: number;
  salaryAmount?: number;
  otAmount?: number;
  basic?: number;
  bonus?: number;
  roomRent?: number;
  conveyance?: number;
  statutoryBonus?: number;
  gross?: number;
  pf?: number;
  pt?: number;
  esic?: number;
  advance?: number;
  otherDeduction?: number;
  totalDeductions?: number;
  netPaid?: number;
  remarks?: string;
  dayMarks?: (string | null)[];
  dayOt?: (number | null)[];
  source?: string;
}

const num = (v: unknown) => (v == null ? undefined : Number(v));

export async function loadStaffSalaries(): Promise<StaffSalary[] | null> {
  if (!supabase) return null;
  const out: StaffSalary[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("staff_salary").select("*").order("month", { ascending: false }).range(from, from + 999);
    if (error) return null;
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      out.push({
        id: String(r.id), staffId: String(r.staff_id), month: String(r.month), epNumber: (r.ep_number as string) ?? undefined, name: String(r.name),
        designation: (r.designation as string) ?? undefined, category: (r.category as string) ?? undefined, sheetSite: (r.sheet_site as string) ?? undefined,
        monthlyRate: num(r.monthly_rate), presentDays: num(r.present_days), otHours: num(r.ot_hours), perDayRate: num(r.per_day_rate), perOtRate: num(r.per_ot_rate),
        salaryAmount: num(r.salary_amount), otAmount: num(r.ot_amount), basic: num(r.basic), bonus: num(r.bonus), roomRent: num(r.room_rent), conveyance: num(r.conveyance),
        statutoryBonus: num(r.statutory_bonus), gross: num(r.gross), pf: num(r.pf), pt: num(r.pt), esic: num(r.esic), advance: num(r.advance), otherDeduction: num(r.other_deduction),
        totalDeductions: num(r.total_deductions), netPaid: num(r.net_paid), remarks: (r.remarks as string) ?? undefined,
        dayMarks: (r.day_marks as (string | null)[]) ?? undefined, dayOt: (r.day_ot as (number | null)[]) ?? undefined, source: (r.source as string) ?? undefined,
      });
    }
    if (!data || data.length < 1000) return out;
  }
}
