"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roleMeta } from "@/lib/roles";
import { useStore } from "@/lib/store";

const QUICK = [
  { user: "uditya", pass: "password", label: "Super Admin" },
  { user: "paint", pass: "paint123", label: "Paint supervisor" },
  { user: "sic", pass: "sic123", label: "SIC" },
  { user: "owner", pass: "owner123", label: "Owner" },
];

const SITES = ["DTA", "MTF", "Marine", "PCG", "Jetty", "Gagva"];

export default function LoginPage() {
  const { state, hydrated, login } = useStore();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && state.currentRole) {
      router.replace(roleMeta(state.currentRole).home);
    }
  }, [hydrated, state.currentRole, router]);

  function enter(user: string, pass: string) {
    setError(null);
    const result = login(user, pass);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(roleMeta(result.role).home);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    enter(username, password);
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--sge-night)] text-sm text-[var(--sge-brass-wash)]">
        Opening the yard desk…
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(280px,42%)_1fr]">
      <aside className="relative hidden overflow-hidden bg-[var(--sge-night)] px-10 py-12 text-[#ffffff] lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 60% at 0% 100%, rgba(232,133,30,0.22), transparent 55%), radial-gradient(ellipse 50% 40% at 100% 0%, rgba(105,114,123,0.35), transparent 50%)",
          }}
        />
        <div className="relative">
          <div className="mb-8 inline-flex items-center gap-2 rounded-sm border border-[rgba(232,133,30,0.35)] bg-[rgba(35,42,49,0.7)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--sge-brass)]">
            RIL Jamnagar · multi-site
          </div>
          <p className="font-heading text-5xl font-semibold leading-[1.05] tracking-tight">
            Shree Gayatri
            <br />
            Enterprise
          </p>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-[#b8c0c8]">
            SGE Operations Hub is the field desk for daily progress, dual paint books,
            and role-locked DPR — same operations, a new shift.
          </p>
        </div>
        <div className="relative">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--sge-brass)]">
            Sites on this desk
          </div>
          <div className="flex flex-wrap gap-2">
            {SITES.map((s) => (
              <span
                key={s}
                className="rounded-sm border border-[rgba(232,133,30,0.28)] px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-[#ffffff]"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </aside>

      <main className="relative flex min-h-dvh flex-col justify-center px-5 py-12 sm:px-10 lg:px-16">
        <div className="sge-enter mx-auto w-full max-w-md">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--sge-brass-ink)]">
            SGE OBMS · v8
          </div>
          <h1 className="font-heading text-4xl font-semibold text-[var(--sge-ink)] md:text-[2.75rem]">
            Sign the yard desk
          </h1>
          <p className="mt-2 text-sm text-[var(--sge-ink-2)] lg:hidden">
            Shree Gayatri Enterprise · RIL Jamnagar multi-site
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="sge-enter sge-enter-delay-1 ledger-card mx-auto mt-8 w-full max-w-md space-y-4 border border-[var(--sge-line)] bg-[var(--sge-paper)] p-6 shadow-[var(--sge-shadow)]"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--sge-ink)]">
            <KeyRound className="h-4 w-4 text-[var(--sge-brass-ink)]" />
            Username / password
          </div>
          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="uditya"
              className="mt-1 rounded-sm bg-[var(--sge-linen)]"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 rounded-sm bg-[var(--sge-linen)]"
            />
          </div>
          {error ? (
            <div className="rounded-sm border border-[var(--sge-crit)]/30 bg-[var(--sge-crit-wash)] px-3 py-2 text-sm text-[var(--sge-crit)]">
              {error}
            </div>
          ) : null}
          <Button type="submit" className="w-full gap-2 rounded-sm">
            Enter desk
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </form>

        <div className="sge-enter sge-enter-delay-2 mx-auto mt-8 w-full max-w-md">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--sge-ink-3)]">
            Quick demo seats
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <Button
                key={q.user}
                type="button"
                variant="outline"
                size="sm"
                className="rounded-sm"
                onClick={() => {
                  setUsername(q.user);
                  setPassword(q.pass);
                  enter(q.user, q.pass);
                }}
              >
                {q.label}
              </Button>
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--sge-ink-3)]">
            Full password list in README. Role switcher only shows roles assigned
            to your account.
          </p>
        </div>
      </main>
    </div>
  );
}
