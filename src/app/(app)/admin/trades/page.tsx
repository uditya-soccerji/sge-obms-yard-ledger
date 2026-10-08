"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TradesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/master-data?sheet=trades");
  }, [router]);
  return (
    <div className="py-16 text-center text-sm text-[var(--sge-ink-3)]">
      Opening Trades in Master Data…
    </div>
  );
}
