"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { OpsPanelId } from "@/lib/desk";

const loading = () => (
  <div className="py-16 text-center text-sm text-[var(--sge-ink-3)]">
    Opening panel…
  </div>
);

const PANELS: Record<OpsPanelId, ComponentType> = {
  dpr: dynamic(() => import("@/app/(app)/dpr/page"), { loading, ssr: false }),
  store: dynamic(() => import("@/app/(app)/store/page"), { loading, ssr: false }),
  safety: dynamic(() => import("@/app/(app)/safety/page"), { loading, ssr: false }),
  crew: dynamic(() => import("@/app/(app)/crew/page"), { loading, ssr: false }),
  equipment: dynamic(() => import("@/app/(app)/equipment/page"), { loading, ssr: false }),
  approvals: dynamic(() => import("@/app/(app)/approvals/sic/page"), {
    loading,
    ssr: false,
  }),
  acpl: dynamic(() => import("@/app/(app)/attendance/acpl/page"), {
    loading,
    ssr: false,
  }),
  jms: dynamic(() => import("@/app/(app)/jms/page"), { loading, ssr: false }),
  finance: dynamic(() => import("@/app/(app)/finance/page"), {
    loading,
    ssr: false,
  }),
  hr: dynamic(() => import("@/app/(app)/hr/page"), { loading, ssr: false }),
  requests: dynamic(() => import("@/app/(app)/requests/page"), {
    loading,
    ssr: false,
  }),
  submissions: dynamic(() => import("@/app/(app)/submissions/page"), {
    loading,
    ssr: false,
  }),
  audit: dynamic(() => import("@/app/(app)/audit/page"), { loading, ssr: false }),
  admin: dynamic(() => import("@/app/(app)/admin/page"), { loading, ssr: false }),
  "paint-calc": dynamic(() => import("@/app/(app)/calculators/paint/page"), {
    loading,
    ssr: false,
  }),
  "area-calc": dynamic(() => import("@/app/(app)/calculators/area/page"), {
    loading,
    ssr: false,
  }),
  "scaffold-calc": dynamic(
    () => import("@/app/(app)/calculators/scaffold/page"),
    { loading, ssr: false }
  ),
  estimate: dynamic(() => import("@/app/(app)/calculators/estimate/page"), {
    loading,
    ssr: false,
  }),
};

export function OpsPanelHost({ panel }: { panel: OpsPanelId }) {
  const Comp = PANELS[panel];
  if (!Comp) return null;
  return <Comp />;
}
