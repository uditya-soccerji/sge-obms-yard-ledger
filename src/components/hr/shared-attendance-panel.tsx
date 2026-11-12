"use client";

/**
 * Shared attendance (migration 008): attendance this browser kept before the shared
 * register is moved up once by the Owner, Super Admin or HR. Hidden when there is
 * nothing to move, or on a copy of the app without the shared database.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel, StatusPill } from "@/components/shared/ui-bits";
import { useStore } from "@/lib/store";

const MAY_MOVE = new Set(["super_admin", "owner", "hr"]);

export function SharedAttendancePanel() {
  const { attendanceSync, moveLocalAttendance, currentAccount } = useStore();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const may = (currentAccount?.roles ?? []).some((r) => MAY_MOVE.has(r));
  if (!attendanceSync.shared || !may || (!attendanceSync.localWaiting && !msg)) return null;
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-sm font-bold">Attendance kept only in this browser</h3>
          <p className="mt-1 text-xs text-[var(--sge-ink-3)]">
            Attendance is now shared: HR, the SIC and the Owner see the same marks on every device.
            {attendanceSync.localWaiting
              ? ` This browser still holds ${attendanceSync.localWaiting.toLocaleString("en-IN")} marks from before. Move them once; a day the shared register already has is left as it is.`
              : ""}
          </p>
        </div>
        {attendanceSync.localWaiting ? (
          <Button
            size="sm"
            disabled={!attendanceSync.loaded || !!attendanceSync.moving}
            onClick={async () => {
              setMsg(null);
              const r = await moveLocalAttendance();
              setMsg({ ok: r.ok, text: r.message });
            }}
          >
            {attendanceSync.moving ? `Moving… ${attendanceSync.moving}` : "Move to shared register"}
          </Button>
        ) : null}
      </div>
      {msg ? (
        <div className="mt-2">
          <StatusPill tone={msg.ok ? "ok" : "crit"}>{msg.ok ? "Done" : "Not moved"}</StatusPill>{" "}
          <span className="text-xs">{msg.text}</span>
        </div>
      ) : null}
    </Panel>
  );
}
