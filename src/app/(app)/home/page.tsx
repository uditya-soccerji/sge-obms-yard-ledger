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
import { ProgressDashboard } from "@/components/home/progress-dashboard";
import { SubconHome, SubconRequestsPanel } from "@/components/home/subcon-home";
import { useStore } from "@/lib/store";

export default function HomePage() {
  const { state } = useStore();
  // Owner, 2026-11-19: progress dashboard on Home — Owner, SA, SIC and Admin see everyone; a supervisor their own work
  const progress = ["owner", "super_admin", "sic", "admin", "subcontractor"].includes(state.currentRole ?? "") || (state.currentRole === "supervisor" && !!state.currentUserId);
  const desk = roleHome(state.currentRole);
  return progress ? (
    <div className="space-y-6">
      <SubconRequestsPanel />
      <ProgressDashboard />
      {desk}
    </div>
  ) : (
    desk
  );
}

function roleHome(role: ReturnType<typeof useStore>["state"]["currentRole"]) {
  switch (role) {
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
    case "subcontractor":
      return <SubconHome />;
    default:
      return (
        <EmptyState title="No desk" detail="Sign in to open a role home." />
      );
  }
}
