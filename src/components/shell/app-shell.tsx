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
import { navForAccount, roleMeta, rolesForSwitcher } from "@/lib/roles";
import { useStore } from "@/lib/store";
import type { RoleId } from "@/lib/types";
import { cn } from "@/lib/utils";

function NavLinks({
  account,
  role,
  onNavigate,
  variant = "rail",
}: {
  account: ReturnType<typeof useStore>["currentAccount"];
  role: RoleId;
  onNavigate?: () => void;
  variant?: "rail" | "bar";
}) {
  const pathname = usePathname();
  const items = navForAccount(account, role);

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
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors",
              variant === "bar"
                ? cn(
                    "border-b-2 px-3 py-2.5",
                    active
                      ? "border-[var(--sge-brass)] text-[var(--sge-brass)]"
                      : "border-transparent text-[#d8cebc] hover:text-[#f6edd0]"
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
          </Link>
        );
      })}
    </nav>
  );
}

function BrandMark() {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-[var(--sge-brass)] font-heading text-sm font-bold text-[var(--sge-night)]">
        S
      </span>
      <span className="min-w-0">
        <span className="block font-heading text-base font-semibold leading-none text-[#f6edd0]">
          SGE Yard Ledger
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
    logout,
    resetSeed,
    endImpersonation,
  } = useStore();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const role = state.currentRole;
  const assigned = rolesForSwitcher(currentAccount);
  const impersonator = state.impersonatorAccountId
    ? state.users.find((u) => u.id === state.impersonatorAccountId) ?? null
    : null;
  const viewingAs = !!impersonator && !!currentAccount;

  const canSwitchSite =
    role === "super_admin" ||
    role === "owner" ||
    role === "sic" ||
    role === "admin" ||
    role === "finance";
  const switchableSites = state.sites.filter(
    (s) =>
      s.enabled &&
      (currentAccount?.roles.includes("super_admin") ||
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

  function exitViewAs() {
    const r = endImpersonation();
    if (r.ok) router.push(r.home);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 bg-[var(--sge-night)] text-[#f3eee4]">
        {viewingAs ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(201,162,39,0.35)] bg-[#3d2a08] px-4 py-2 text-[#f6edd0] md:px-6">
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
            className="text-[#f6edd0] hover:bg-[var(--sge-night-2)] md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <BrandMark />
          <div className="hidden min-w-0 flex-1 md:block">
            <div className="truncate text-right text-[11px] text-[#d8cebc]">
              {currentAccount.name} · @{currentAccount.username}
            </div>
            <div className="truncate text-right text-[10px] uppercase tracking-[0.12em] text-[var(--sge-brass)]">
              {meta.label} · {site?.name ?? "Site"}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {canSwitchSite && switchableSites.length > 1 ? (
              <Select
                value={state.currentSiteId}
                onValueChange={(v) => switchSite(v)}
              >
                <SelectTrigger className="h-8 w-[9.5rem] rounded-sm border-[rgba(201,162,39,0.35)] bg-[var(--sge-night-2)] text-xs text-[#f6edd0]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {switchableSites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code}
                      {s.rpTags.length ? ` · ${s.rpTags.join("/")}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="hidden rounded-sm border border-[rgba(201,162,39,0.28)] px-2 py-1.5 font-mono text-[11px] text-[#f6edd0] sm:block">
                {site?.code ?? "—"}
                {site?.rpTags?.length ? ` · ${site.rpTags.join("/")}` : ""}
              </div>
            )}
            {assigned.length > 1 ? (
              <Select
                value={role}
                onValueChange={(v) => {
                  const next = v as RoleId;
                  switchRole(next);
                  router.push(roleMeta(next).home);
                }}
              >
                <SelectTrigger className="h-8 w-[9.5rem] rounded-sm border-[rgba(201,162,39,0.35)] bg-[var(--sge-night-2)] text-xs text-[#f6edd0]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
            <Button
              variant="ghost"
              size="sm"
              className="hidden rounded-sm text-[#d8cebc] hover:bg-[var(--sge-night-2)] hover:text-[#f6edd0] md:inline-flex"
              onClick={() => {
                resetSeed();
                router.push("/");
              }}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Reset
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="hidden rounded-sm text-[#d8cebc] hover:bg-[var(--sge-night-2)] hover:text-[#f6edd0] md:inline-flex"
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
        <div className="hidden border-t border-[rgba(201,162,39,0.22)] px-3 md:block md:px-6">
          <NavLinks account={currentAccount} role={role} variant="bar" />
        </div>
        <div className="ledger-rule" />
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 py-2 md:hidden">
        {navForAccount(currentAccount, role).map((item) => (
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
        {children}
      </main>

      <footer className="border-t border-[var(--sge-line)] bg-[var(--sge-paper)]/80 px-4 py-3 text-center text-[10px] uppercase tracking-[0.16em] text-[var(--sge-ink-3)]">
        Shree Gayatri Enterprise · RIL Jamnagar · Yard Ledger v7
      </footer>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] bg-[var(--sge-paper)] p-0">
          <SheetHeader className="border-b border-[var(--sge-line)] px-4 py-3 text-left">
            <SheetTitle className="font-heading">Yard Ledger</SheetTitle>
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
                <SelectContent>
                  {switchableSites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                <SelectContent>
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
            <NavLinks
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
            <Button
              variant="outline"
              className="w-full rounded-sm"
              onClick={() => {
                resetSeed();
                setMobileOpen(false);
                router.push("/");
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Reset seed data
            </Button>
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
