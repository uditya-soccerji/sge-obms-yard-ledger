"use client";

import AdminHomePage from "@/app/(app)/admin/page";
import FinanceHomePage from "@/app/(app)/finance/page";
import HrHomePage from "@/app/(app)/hr/page";
import LabourerHomePage from "@/app/(app)/labourer/page";
import OwnerHomePage from "@/app/(app)/owner/page";
import SafetyHomePage from "@/app/(app)/safety/page";
import SicHomePage from "@/app/(app)/sic/page";
import StoreHomePage from "@/app/(app)/store/page";
import SupervisorHomePage from "@/app/(app)/supervisor/page";
import { EmptyState } from "@/components/shared/ui-bits";
import { useStore } from "@/lib/store";

export default function HomePage() {
  const { state } = useStore();
  switch (state.currentRole) {
    case "super_admin":
    case "owner":
      return <OwnerHomePage />;
    case "sic":
      return <SicHomePage />;
    case "admin":
      return <AdminHomePage />;
    case "hr":
      return <HrHomePage />;
    case "finance":
      return <FinanceHomePage />;
    case "supervisor":
      return <SupervisorHomePage />;
    case "store":
      return <StoreHomePage />;
    case "safety":
      return <SafetyHomePage />;
    case "labourer":
      return <LabourerHomePage />;
    default:
      return (
        <EmptyState title="No desk" detail="Sign in to open a role home." />
      );
  }
}
