"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RatesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/master-data?sheet=rateBook");
  }, [router]);
  return (
    <div className="py-16 text-center text-sm text-[var(--sge-ink-3)]">
      Opening Rate book in Master Data…
    </div>
  );
}
