"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { EmptyState } from "@/components/shared/ui-bits";
import { canAccessMasterData } from "@/lib/desk";
import { useStore } from "@/lib/store";

const MasterDesk = dynamic(
  () =>
    import("@/components/master/master-desk").then((m) => ({
      default: m.MasterDesk,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="py-16 text-center text-sm text-[var(--sge-ink-3)]">
        Loading master sheets…
      </div>
    ),
  }
);

export default function MasterDataPage() {
  const { state } = useStore();
  if (!canAccessMasterData(state.currentRole)) {
    return (
      <EmptyState
        title="Master Data is Owner / Super Admin"
        detail="Other seats never open this screen. Home and Operations still use the values."
      />
    );
  }
  return (
    <>
      <div className="md:hidden">
        <EmptyState
          title="Desktop sheet"
          detail="Master Data is not a phone task. Open this on a wider screen."
        />
      </div>
      <div className="hidden md:block">
        <Suspense
          fallback={
            <div className="py-16 text-center text-sm text-[var(--sge-ink-3)]">
              Loading master sheets…
            </div>
          }
        >
          <MasterDesk />
        </Suspense>
      </div>
    </>
  );
}
