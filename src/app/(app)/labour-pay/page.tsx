"use client";

import { LabourPay } from "@/components/hr/labour-pay";
import { useStore } from "@/lib/store";
import { canViewModule } from "@/lib/permissions";
import { EmptyState } from "@/components/shared/ui-bits";

// Round 2 (§27): HR and Finance see every labourer's monthly pay
export default function LabourPayPage() {
  const { state, currentAccount } = useStore();
  const ok = canViewModule(currentAccount, state.currentRole, "hr") || canViewModule(currentAccount, state.currentRole, "finance");
  return ok ? <LabourPay /> : <EmptyState title="No access" detail="Labour pay is for HR, Finance, Owner and Super Admin." />;
}
