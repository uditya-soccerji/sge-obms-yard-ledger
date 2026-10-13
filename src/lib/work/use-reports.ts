"use client";

import { ALL_SITES } from "../site-scope";
import { useStore } from "../store";
import { useWork } from "./store";
import type { DprReport } from "./types";

/** Daily reports on the header site (all of them in All sites) — what DPR screens list. */
export function useSiteReports(): DprReport[] {
  const { state } = useStore();
  const { work } = useWork();
  return state.currentSiteId === ALL_SITES ? work.reports : work.reports.filter((r) => r.siteId === state.currentSiteId);
}
