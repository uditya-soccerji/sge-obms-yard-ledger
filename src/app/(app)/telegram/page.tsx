"use client";

import { guarded } from "@/components/shared/require-module";
import { useState } from "react";
import {
  EmptyState,
  Panel,
  SectionHeader,
  StatusPill,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ROLES } from "@/lib/roles";
import { useStore } from "@/lib/store";
import type { DraftEntityKind, MessageType, RoleId } from "@/lib/types";

const ENTITY_MAP: {
  role: RoleId;
  messageType: MessageType;
  entity: DraftEntityKind;
  hint: string;
  sample: string;
}[] = [
  {
    role: "labourer",
    messageType: "text",
    entity: "attendance",
    hint: "Check-in / out → attendance punch",
    sample: "IN PP5920188421 pipe rack B-12",
  },
  {
    role: "supervisor",
    messageType: "text",
    entity: "dpr_note",
    hint: "DPR line → append to open DPR draft lines",
    sample: "Painted 80 m² MPS-2 intermediate on B-12 west",
  },
  {
    role: "supervisor",
    messageType: "image",
    entity: "dpr_note",
    hint: "Permit / board photo → DPR attachment note",
    sample: "[photo] permit board COKER V-204 valid till 18:00",
  },
  {
    role: "store",
    messageType: "image",
    entity: "stock_receipt",
    hint: "GRN / batch label photo → stock receipt draft",
    sample: "[photo] GRN batch B-T5-0902 SAP 2002462171 200L",
  },
  {
    role: "store",
    messageType: "text",
    entity: "stock_receipt",
    hint: "Issue qty + SAP → stock movement",
    sample: "ISSUE 40L 2002462179 to Chauhan B-12",
  },
  {
    role: "safety",
    messageType: "image",
    entity: "safety_obs",
    hint: "Obs photo → safety observation",
    sample: "[photo] UA helper without gloves near hopper",
  },
  {
    role: "safety",
    messageType: "text",
    entity: "safety_obs",
    hint: "SAFE/UA/UC note → Safety DPR",
    sample: "UA: scaffolding toe-board missing EL+12 — closed",
  },
  {
    role: "owner",
    messageType: "text",
    entity: "expense",
    hint: "Expense amount → finance entry",
    sample: "Expense diesel 8500 compressor fill",
  },
  {
    role: "hr",
    messageType: "doc",
    entity: "attendance",
    hint: "Bulk attendance CSV/doc → attendance pool",
    sample: "[doc] attendance_pool_2026-10-05.csv",
  },
  {
    role: "sic",
    messageType: "audio",
    entity: "dpr_note",
    hint: "Voice note → DPR / gist note",
    sample: "[audio] Site roll-up: B-12 on track, V-204 lagging slag recovery",
  },
];

function TelegramPage() {
  const { state, currentAccount, applyTelegram } = useStore();
  const allowed =
    state.currentRole === "super_admin" ||
    state.currentRole === "owner" ||
    // honor per-login override
    !!currentAccount?.permissionOverrides.find(
      (o) => o.module === "telegram" && o.action === "view" && o.allow
    );

  const [role, setRole] = useState<RoleId>(
    state.currentRole === "owner" || state.currentRole === "super_admin"
      ? "supervisor"
      : state.currentRole ?? "supervisor"
  );
  const [messageType, setMessageType] = useState<MessageType>("text");
  const [content, setContent] = useState(
    "Painted 80 m² MPS-2 intermediate on B-12 west"
  );
  const [mappedEntity, setMappedEntity] = useState<DraftEntityKind>("dpr_note");
  const [lastId, setLastId] = useState<string | null>(null);

  const suggestions = ENTITY_MAP.filter(
    (m) => m.role === role && m.messageType === messageType
  );

  function applySuggestion(entity: DraftEntityKind, sample: string) {
    setMappedEntity(entity);
    setContent(sample);
  }

  function submit() {
    const draft = applyTelegram({
      role,
      messageType,
      content,
      mappedEntity,
    });
    setLastId(draft.id);
  }

  if (!allowed) {
    return (
      <EmptyState
        title="Telegram simulator restricted"
        detail="Available to Super Admin and Owner only (ACL 10C). Ask SA for a per-login override if needed."
      />
    );
  }

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Telegram simulator"
        subtitle="Pick role + message type + paste content → creates/updates a draft entity. Mapping is explicit so founder can critique."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>From role</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as RoleId)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Message type</Label>
              <Select
                value={messageType}
                onValueChange={(v) => setMessageType(v as MessageType)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["text", "image", "doc", "audio"] as const).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Maps to entity</Label>
            <Select
              value={mappedEntity}
              onValueChange={(v) => setMappedEntity(v as DraftEntityKind)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  [
                    "attendance",
                    "dpr_note",
                    "expense",
                    "stock_receipt",
                    "safety_obs",
                    "query",
                  ] as const
                ).map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Message content</Label>
            <Textarea
              className="mt-1 min-h-[120px]"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <div className="rounded-md border border-dashed border-[var(--sge-line-strong)] bg-[var(--sge-ground)] p-3 text-sm">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">
              Mapping preview
            </div>
            <code className="font-mono text-xs">
              {role} · {messageType} → {mappedEntity}
            </code>
          </div>

          <Button onClick={submit} disabled={!content.trim()}>
            Inject into OBMS
          </Button>
          {lastId ? (
            <div className="text-sm text-[var(--sge-ok)]">
              Applied draft {lastId} — check the feed and related role home.
            </div>
          ) : null}
        </Panel>

        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            Suggested mappings for this role / type
          </h3>
          {suggestions.length === 0 ? (
            <EmptyState
              title="No canned mapping"
              detail="Pick entity manually — founder can critique odd combinations."
            />
          ) : (
            <div className="space-y-2">
              {suggestions.map((s) => (
                <button
                  key={`${s.role}-${s.messageType}-${s.entity}-${s.sample}`}
                  type="button"
                  onClick={() => applySuggestion(s.entity, s.sample)}
                  className="w-full rounded-md border border-[var(--sge-line)] px-3 py-2 text-left text-sm transition hover:border-[var(--sge-accent)]/50"
                >
                  <div className="flex items-center gap-2">
                    <StatusPill tone="accent">{s.entity}</StatusPill>
                    <span className="text-xs text-[var(--sge-ink-3)]">
                      {s.hint}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-[var(--sge-ink-2)]">
                    {s.sample}
                  </div>
                </button>
              ))}
            </div>
          )}

          <h3 className="mb-2 mt-6 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            Ingest feed
          </h3>
          {state.telegramDrafts.length === 0 ? (
            <EmptyState
              title="No messages yet"
              detail="Inject a mock Telegram message to see role → entity mapping."
            />
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {state.telegramDrafts.map((d) => (
                <div
                  key={d.id}
                  className="rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap gap-2">
                    <StatusPill>{d.role}</StatusPill>
                    <StatusPill tone="accent">{d.messageType}</StatusPill>
                    <StatusPill tone="ok">→ {d.mappedEntity}</StatusPill>
                    {d.status === "needs_review" ? (
                      <StatusPill tone="crit">needs review — nothing posted</StatusPill>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[var(--sge-ink-2)]">{d.content}</p>
                  <div className="mt-1 font-mono text-[10px] text-[var(--sge-ink-3)]">
                    {d.createdAt}
                    {d.entityId ? ` · entity ${d.entityId}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("telegram", TelegramPage);
