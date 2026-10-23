"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { roleMeta, rolesForSwitcher } from "@/lib/roles";
import { NotificationBell } from "@/components/work/notifications";
import { canAccessWork, topNavFor } from "@/lib/desk";
import { canUseTestTools } from "@/lib/permissions";
import { ALL_SITES, canSeeAllSites, canSwitchSites, entrySiteId, isCentralStore } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import { useWork } from "@/lib/work/store";
import type { RoleId } from "@/lib/types";
import { cn } from "@/lib/utils";

function DeskNav({
  account,
  role,
  onNavigate,
  variant = "bar",
}: {
  account: ReturnType<typeof useStore>["currentAccount"];
  role: RoleId;
  onNavigate?: () => void;
  variant?: "rail" | "bar";
}) {
  const pathname = usePathname();
  const items = topNavFor(account, role);
  // Requests waiting for Owner / SA, counted on the Master Data tab (2026-10-24)
  const waitingMaster = useStore().fullState.wageChangeRequests.filter((r) => r.status === "pending").length;

  return (
    <nav
      className={cn(
        variant === "bar"
          ? "flex flex-wrap items-stretch gap-x-0.5"
          : "flex flex-col gap-0.5"
      )}
    >
      {items.map((item) => {
        const active =
          item.href === "/home"
            ? pathname === "/home" || pathname === "/"
            : pathname === item.href || pathname.startsWith(item.href + "/");
        const mobileHideMaster = item.id === "master";
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors",
              mobileHideMaster && "max-md:hidden",
              variant === "bar"
                ? cn(
                    "border-b-2 px-3 py-2.5",
                    active
                      ? "border-[var(--sge-brass)] text-[var(--sge-brass)]"
                      : "border-transparent text-[#b8c0c8] hover:text-[#ffffff]"
                  )
                : cn(
                    "rounded-sm px-3 py-2",
                    active
                      ? "bg-[var(--sge-brass-wash)] text-[var(--sge-brass-ink)]"
                      : "text-[var(--sge-ink-2)] hover:bg-[var(--sge-paper-2)] hover:text-[var(--sge-ink)]"
                  )
            )}
          >
            {item.label}
            {item.id === "master" && waitingMaster ? (
              <span
                aria-label={`${waitingMaster} waiting`}
                title={`${waitingMaster} request${waitingMaster === 1 ? "" : "s"} waiting for Owner / Super Admin`}
                className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--sge-brass)] px-1 align-middle text-[10px] font-bold leading-none tracking-normal text-white"
              >
                {waitingMaster}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function BrandMark() {
  return (
    <Link href="/home" className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-[var(--sge-brass)] font-heading text-sm font-bold text-[var(--sge-night)]">
        S
      </span>
      <span className="min-w-0">
        <span className="block font-heading text-base font-semibold leading-none text-[#ffffff]">
          SGE Operations Hub
        </span>
        <span className="mt-0.5 block text-[10px] uppercase tracking-[0.16em] text-[var(--sge-brass)]">
          OBMS · ops desk
        </span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    state,
    hydrated,
    currentAccount,
    switchRole,
    switchSite,
    setEntrySite,
    logout,
    resetSeed,
    endImpersonation,
    labourerSync,
  } = useStore();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const role = state.currentRole;
  const assigned = rolesForSwitcher(currentAccount);
  const impersonator = state.impersonatorAccountId
    ? state.users.find((u) => u.id === state.impersonatorAccountId) ?? null
    : null;
  const viewingAs = !!impersonator && !!currentAccount;
  const showReset = canUseTestTools(role, viewingAs);
  const { resetWork } = useWork();
  // X6: ask first, and reset both the main and the Work data
  const resetAll = () => {
    if (!window.confirm("Reset all demo data? This signs everyone out and restores the seed for every module, including Work.")) return false;
    resetWork();
    resetSeed();
    router.push("/");
    return true;
  };
  const currentSite = state.sites.find((s) => s.id === state.currentSiteId);
  const siteOff = !!currentSite && !currentSite.enabled;

  const canSwitchSite = canSwitchSites(role);
  // Switched-off sites stay listed (read only there) so nobody is stuck on one (M5)
  const central = role === "store" && isCentralStore(currentAccount);
  const switchableSites = state.sites.filter(
    (s) =>
      (s.enabled || s.id === state.currentSiteId || role === "super_admin" || role === "owner") &&
      (currentAccount?.roles.includes("super_admin") ||
        central ||
        currentAccount?.siteIds.includes(s.id))
  );

  useEffect(() => {
    if (hydrated && (!role || !currentAccount)) {
      router.replace("/");
    }
  }, [hydrated, role, currentAccount, router]);

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--sge-night)] text-sm text-[var(--sge-brass-wash)]">
        Opening the yard desk…
      </div>
    );
  }

  if (!role || !currentAccount) return null;

  const meta = roleMeta(role);
  const site = state.sites.find((s) => s.id === state.currentSiteId);
  const allSites = state.currentSiteId === ALL_SITES;
  const showAllOption = canSeeAllSites(role, currentAccount) && switchableSites.length > 1;
  const entrySite = state.sites.find((s) => s.id === entrySiteId(state));

  function exitViewAs() {
    const r = endImpersonation();
    if (r.ok) router.push(r.home);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 bg-[var(--sge-night)] text-[#ffffff]">
        {viewingAs ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(232,133,30,0.35)] bg-[#5a3406] px-4 py-2 text-[#ffffff] md:px-6">
            <p className="min-w-0 flex-1 text-xs font-semibold leading-snug sm:text-sm">
              Viewing as {currentAccount.name} (@{currentAccount.username}) —
              Exit to Super Admin
            </p>
            <Button
              size="sm"
              className="shrink-0 rounded-sm bg-[var(--sge-brass)] text-[var(--sge-night)] hover:bg-[var(--sge-brass)]/90"
              onClick={exitViewAs}
            >
              Exit to Super Admin
            </Button>
          </div>
        ) : null}

        <div className="flex items-center gap-3 px-3 py-3 md:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-[#ffffff] hover:bg-[var(--sge-night-2)] md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <BrandMark />
          <div className="hidden min-w-0 flex-1 md:block">
            <div className="truncate text-right text-[11px] text-[#b8c0c8]">
              {currentAccount.name} · @{currentAccount.username}
            </div>
            <div className="truncate text-right text-[10px] uppercase tracking-[0.12em] text-[var(--sge-brass)]">
              {meta.label} · {allSites ? "All sites" : site?.name ?? "Site"}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {canSwitchSite && switchableSites.length > 1 ? (
              <Select
                value={state.currentSiteId}
                onValueChange={(v) => switchSite(v)}
              >
                <SelectTrigger className="h-8 w-[9.5rem] rounded-sm border-[rgba(232,133,30,0.35)] bg-[var(--sge-night-2)] text-xs text-[#ffffff]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {showAllOption ? (
                    <SelectItem value={ALL_SITES}>All sites</SelectItem>
                  ) : null}
                  {switchableSites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code}
                      {s.rpTags.length ? ` · ${s.rpTags.join("/")}` : ""}
                      {s.enabled ? "" : " (off)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="hidden rounded-sm border border-[rgba(232,133,30,0.28)] px-2 py-1.5 font-mono text-[11px] text-[#ffffff] sm:block">
                {site?.code ?? "—"}
                {site?.rpTags?.length ? ` · ${site.rpTags.join("/")}` : ""}
              </div>
            )}
            {allSites ? (
              <Select value={entrySite?.id} onValueChange={(v) => setEntrySite(v)}>
                <SelectTrigger
                  title="Site that new entries are saved to while viewing All sites"
                  className="hidden h-8 w-[10.5rem] rounded-sm border-dashed border-[rgba(232,133,30,0.5)] bg-transparent text-xs text-[#ffffff] md:flex"
                >
                  <span className="mr-1 text-[#b8c0c8]">New →</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {switchableSites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code}
                      {s.enabled ? "" : " (off)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {/* HR has no Work tab but gets gate-pass alerts (docs §24) */}
            {canAccessWork(role) || role === "hr" ? <NotificationBell /> : null}
            {assigned.length > 1 ? (
              <Select
                value={role}
                onValueChange={(v) => {
                  const next = v as RoleId;
                  switchRole(next);
                  router.push(roleMeta(next).home);
                }}
              >
                <SelectTrigger className="h-8 w-[9.5rem] rounded-sm border-[rgba(232,133,30,0.35)] bg-[var(--sge-night-2)] text-xs text-[#ffffff]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {assigned.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-sm bg-[var(--sge-brass)] px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--sge-night)]">
                {meta.short}
              </div>
            )}
            {showReset ? (
              <Button
                variant="ghost"
                size="sm"
                className="hidden rounded-sm text-[#b8c0c8] hover:bg-[var(--sge-night-2)] hover:text-[#ffffff] md:inline-flex"
                onClick={resetAll}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Reset
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="hidden rounded-sm text-[#b8c0c8] hover:bg-[var(--sge-night-2)] hover:text-[#ffffff] md:inline-flex"
              onClick={() => {
                logout();
                router.push("/");
              }}
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        </div>
        <div className="hidden border-t border-[rgba(232,133,30,0.22)] px-3 md:block md:px-6">
          <DeskNav account={currentAccount} role={role} variant="bar" />
        </div>
        <div className="ledger-rule" />
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 py-2 md:hidden">
        {topNavFor(currentAccount, role)
          .filter((item) => item.id !== "master")
          .map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-sm bg-[var(--sge-paper-2)] px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--sge-ink-2)]"
            >
              {item.label}
            </Link>
          ))}
      </div>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-3 py-5 md:px-6 md:py-7">
        {siteOff ? (
          <div className="mb-3 rounded-sm border border-[var(--sge-warn)]/40 bg-[var(--sge-warn-wash)] px-3 py-2 text-sm text-[var(--sge-warn)]">
            {currentSite?.code} is switched off — read only. Switch it back on in Master Data → Sites, or pick another site.
          </div>
        ) : null}
        {labourerSync.error ? (
          // Shared labourer register (migration 006): say so when a change didn't reach the server
          <div role="alert" className="mb-3 rounded-sm border border-[var(--sge-crit)]/40 bg-[var(--sge-crit-wash)] px-3 py-2 text-sm text-[var(--sge-crit)]">
            {labourerSync.error}. Your change is kept on this device and will be sent again — check your connection.
          </div>
        ) : null}
        {children}
      </main>

      <footer className="border-t border-[var(--sge-line)] bg-[var(--sge-paper)]/80 px-4 py-3 text-center text-[10px] uppercase tracking-[0.16em] text-[var(--sge-ink-3)]">
        Shree Gayatri Enterprise · RIL Jamnagar · Operations Hub v8
      </footer>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] bg-[var(--sge-paper)] p-0">
          <SheetHeader className="border-b border-[var(--sge-line)] px-4 py-3 text-left">
            <SheetTitle className="font-heading">SGE Operations Hub</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 p-3">
            {canSwitchSite && switchableSites.length > 1 ? (
              <Select
                value={state.currentSiteId}
                onValueChange={(v) => switchSite(v)}
              >
                <SelectTrigger className="w-full rounded-sm">
                  <SelectValue placeholder="Site" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {showAllOption ? (
                    <SelectItem value={ALL_SITES}>All sites</SelectItem>
                  ) : null}
                  {switchableSites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {allSites ? (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">
                  New entries go to
                </div>
                <Select value={entrySite?.id} onValueChange={(v) => setEntrySite(v)}>
                  <SelectTrigger className="w-full rounded-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {switchableSites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.code} — {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {assigned.length > 1 ? (
              <Select
                value={role}
                onValueChange={(v) => {
                  const next = v as RoleId;
                  switchRole(next);
                  setMobileOpen(false);
                  router.push(roleMeta(next).home);
                }}
              >
                <SelectTrigger className="w-full rounded-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {assigned.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm font-medium">{meta.label}</div>
            )}
            <DeskNav
              account={currentAccount}
              role={role}
              onNavigate={() => setMobileOpen(false)}
              variant="rail"
            />
            {viewingAs ? (
              <Button
                className="w-full rounded-sm"
                onClick={() => {
                  setMobileOpen(false);
                  exitViewAs();
                }}
              >
                Exit to Super Admin
              </Button>
            ) : null}
            {showReset ? (
              <Button
                variant="outline"
                className="w-full rounded-sm"
                onClick={() => {
                  if (resetAll()) setMobileOpen(false);
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Reset seed data
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="w-full rounded-sm"
              onClick={() => {
                logout();
                setMobileOpen(false);
                router.push("/");
              }}
            >
              <X className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
