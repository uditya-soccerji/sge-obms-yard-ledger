"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Users live in Master Data. */
export default function UsersRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/master-data?sheet=users");
  }, [router]);
  return (
    <div className="py-16 text-center text-sm text-[var(--sge-ink-3)]">
      Opening Users in Master Data…
    </div>
  );
}
