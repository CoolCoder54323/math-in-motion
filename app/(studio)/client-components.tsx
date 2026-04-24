"use client";

import Image from "next/image";
import { useAuth, ProtectedRoute } from "@/lib/auth-context";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const TABS = [
  { label: "Workshop", href: "/workshop" },
  { label: "View Animations", href: "/animations" },
];

function StudioNav() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="flex-shrink-0 border-b border-[color:var(--rule)]/30 bg-[color:var(--paper)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 md:px-12">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="Math In Motion" width={28} height={28} className="h-7 w-7" />
          <span className="font-heading text-lg font-semibold text-[color:var(--umber)]">Math In Motion</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {TABS.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-lg px-3 py-1.5 font-heading text-sm transition-colors ${
                  isActive
                    ? "bg-[color:var(--sunflower)]/40 font-semibold text-[color:var(--sunflower-deep)]"
                    : "text-[color:var(--umber)]/70 hover:text-[color:var(--umber)]"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          {user?.tier !== "unlimited" && (
            <span className="hidden text-xs font-heading tabular-nums text-[color:var(--umber)]/60 md:inline">
              {user?.promptsUsed}/{user?.promptsLimit} prompts
            </span>
          )}
          <span className="hidden font-heading text-xs text-[color:var(--umber)]/50 md:inline">
            {user?.name}
          </span>
          <button
            onClick={logout}
            className="hidden font-heading text-xs italic text-[color:var(--umber)]/60 underline-offset-4 hover:text-[color:var(--accent)] hover:underline md:inline"
          >
            Sign out
          </button>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded-md p-1.5 md:hidden"
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-[color:var(--umber)]">
              {menuOpen ? (
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <>
                  <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-[color:var(--rule)]/20 px-6 py-3 md:hidden">
          {TABS.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={() => setMenuOpen(false)}
                className={`block rounded-lg px-3 py-2 font-heading text-sm ${
                  isActive
                    ? "bg-[color:var(--sunflower)]/40 font-semibold text-[color:var(--sunflower-deep)]"
                    : "text-[color:var(--umber)]/70"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
          <div className="mt-2 border-t border-[color:var(--rule)]/20 pt-2">
            <span className="block font-heading text-xs text-[color:var(--umber)]/60">
              {user?.name} · {user?.tier}
            </span>
            <button
              onClick={() => { logout(); setMenuOpen(false); }}
              className="mt-1 font-heading text-xs italic text-[color:var(--umber)]/60 underline-offset-4 hover:text-[color:var(--accent)] hover:underline"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}

export function StudioNavClient() {
  return <StudioNav />;
}

export function ProtectedRouteClient({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
