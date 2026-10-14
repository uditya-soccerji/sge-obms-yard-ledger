"use client";

import { useState } from "react";
import { formatINR, Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { checkPayImport, PAY_TEMPLATE_CSV, payLabel } from "@/lib/pay-import";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useWork } from "@/lib/work/store";

/**
 * Monthly pay upload (docs §24): Admin or HR upload the month's CSV; only new or
 * changed lines are applied and Finance is told. A line already uploaded with
 * the same amount says who uploaded it.
 */
export function PayUploadPanel() {
  const { fullState, importPay } = useStore();
  const { notify } = useWork();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const result = text ? checkPayImport(text, fullState.labourers, fullState.wageLedger) : null;
  const rows = result?.rows ?? [];
  const good = rows.filter((r) => !r.errors.length);
  const count = (st: "new" | "changed" | "same") => good.reduce((n, r) => n + r.lines.filter((l) => l.state === st).length, 0);
  const months = [...new Set(good.map((r) => r.month))].sort();

  async function pick(f: File | undefined) {
    if (!f) return;
    setMsg(null);
    if (!/\.csv$/i.test(f.name)) {
      setText(null);
      return setMsg({ ok: false, text: "Choose a .csv file — in Excel use File → Save As → CSV (Comma delimited)." });
    }
    setFile(f.name);
    setText(await f.text());
  }

  function apply() {
    const res = importPay(good.map((r) => ({ labourerId: r.labourerId!, month: r.month, lines: r.lines })), file);
    if (!res.ok) return setMsg({ ok: false, text: res.error ?? "Not uploaded" });
    const same = count("same");
    setMsg({ ok: true, text: `${res.added} pay lines added, ${res.changed} changed${same ? ` · ${same} not uploaded — already in` : ""}. Finance has been told.` });
    notify({ kind: "pay_uploaded", siteId: "", title: `Pay for ${months.join(", ")} uploaded`, detail: `${good.length} labourers · ${res.added} new, ${res.changed} changed lines · ${file}`, tab: "/finance", refId: file });
    setText(null);
  }

  function template() {
    const url = URL.createObjectURL(new Blob([PAY_TEMPLATE_CSV], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "monthly-pay-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-sm font-bold">Monthly pay upload</h3>
        <span className="text-xs text-[var(--sge-ink-3)]">One CSV a month: EP, month and the pay columns. Only new or changed lines are applied; Finance is told.</span>
        <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Upload pay (CSV)"}
        </Button>
      </div>
      {open ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <input aria-label="Pay CSV file" type="file" accept=".csv,text/csv" onChange={(e) => void pick(e.target.files?.[0])} />
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={template}>Download template</Button>
          </div>
          {msg ? <p className={cn("text-sm", msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{msg.text}</p> : null}
          {result?.missing.length ? <p className="text-sm text-[var(--sge-crit)]">The file is missing: {result.missing.join(", ")}.</p> : null}
          {text && rows.length ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold">{file}</span>
                <span className="text-[var(--sge-ink-3)]">{months.join(", ")}</span>
                <StatusPill tone="ok">{count("new")} new</StatusPill>
                {count("changed") ? <StatusPill tone="warn">{count("changed")} changed</StatusPill> : null}
                {count("same") ? <StatusPill tone="default">{count("same")} already uploaded</StatusPill> : null}
                {rows.length - good.length ? <StatusPill tone="crit">{rows.length - good.length} lines with errors (skipped)</StatusPill> : null}
                <Button size="sm" className="ml-auto h-8" disabled={!count("new") && !count("changed")} onClick={apply}>
                  Apply {count("new") + count("changed")} lines
                </Button>
              </div>
              <div className="max-h-80 overflow-auto rounded-sm border border-[var(--sge-line)]">
                <table className="w-full min-w-[640px] text-xs [&_td]:px-2 [&_th]:px-2">
                  <thead className="sticky top-0 bg-[var(--sge-paper-2)] text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
                    <tr>
                      <th className="py-1">Line</th>
                      <th>EP</th>
                      <th>Name</th>
                      <th>Month</th>
                      <th>Pay lines</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 300).map((r) => (
                      <tr key={r.line} className={cn("border-t border-[var(--sge-line)] align-top", r.errors.length ? "bg-[var(--sge-crit-wash)]" : "")}>
                        <td className="py-1 font-mono">{r.line}</td>
                        <td className="font-mono">{r.ep || "—"}</td>
                        <td>{r.name || "—"}</td>
                        <td className="font-mono">{r.month}</td>
                        <td>
                          {r.errors.length ? (
                            <span className="text-[var(--sge-crit)]">{r.errors.join("; ")}</span>
                          ) : (
                            r.lines.map((l) => (
                              <span
                                key={l.kind}
                                className={cn(
                                  "mr-2 inline-block",
                                  l.state === "new" ? "text-[var(--sge-ok)]" : l.state === "changed" ? "text-[var(--sge-warn)]" : "text-[var(--sge-ink-3)]"
                                )}
                                title={l.state === "same" ? `Not uploaded — already uploaded by ${l.by}` : l.state === "changed" ? `Was ${formatINR(l.was ?? 0)} (${l.by})` : "New"}
                              >
                                {payLabel(l.kind)} {formatINR(l.amount)}
                                {l.state === "changed" ? ` (was ${formatINR(l.was ?? 0)})` : l.state === "same" ? " · already uploaded" : ""}
                              </span>
                            ))
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
