"use client";

import { AppShell } from "@/components/shell/app-shell";
import { WorkProvider } from "@/lib/work/store";

export default function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkProvider>
      <AppShell>{children}</AppShell>
    </WorkProvider>
  );
}
