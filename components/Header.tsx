"use client";

import Link from "next/link";
import { useState } from "react";

import { WORKSPACE_MODULES } from "@/lib/modules";

interface HeaderProps {
  activeModule: (typeof WORKSPACE_MODULES)[number]["id"];
}

export default function Header({ activeModule }: HeaderProps) {
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth", { method: "DELETE" });
    } finally {
      // Full navigation clears all in-memory state, including the API key.
      window.location.replace("/login");
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-6 lg:h-16 lg:flex-nowrap lg:py-0">
        <Link href="/dashboard" className="shrink-0 leading-none" aria-label="Intelligo ID Marketing Kit — home">
          <span className="block text-[11px] font-semibold tracking-[0.22em] text-navy">INTELLIGO ID</span>
          <span className="mt-1 block text-base font-bold tracking-tight text-navy">
            MARKETING KIT<span className="text-orange">.</span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-2 lg:order-3">
          <span className="hidden text-sm font-medium text-muted sm:inline">Marketing Kit</span>
          <span aria-hidden="true" className="hidden h-5 w-px bg-line sm:inline-block" />
          <button type="button" onClick={logout} disabled={loggingOut} className="btn-ghost text-sm">
            {loggingOut ? "Logging out…" : "Logout"}
          </button>
        </div>

        <nav aria-label="Workspace modules" className="order-last -mx-1 w-full overflow-x-auto lg:order-2 lg:mx-0 lg:w-auto">
          <ul className="flex items-center gap-1">
            {WORKSPACE_MODULES.map((m) => {
              const active = m.id === activeModule;
              if (m.status !== "active") {
                return (
                  <li key={m.id}>
                    <span
                      aria-disabled="true"
                      title={`${m.label} — Coming Soon`}
                      className="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold tracking-[0.1em] whitespace-nowrap text-navy/40 uppercase"
                    >
                      {m.label}
                      <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-medium tracking-normal text-muted normal-case">
                        Coming Soon
                      </span>
                    </span>
                  </li>
                );
              }
              return (
                <li key={m.id}>
                  <Link
                    href={m.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center rounded-md px-3 py-2 text-xs font-semibold tracking-[0.1em] whitespace-nowrap uppercase transition-colors ${
                      active ? "text-navy" : "text-muted hover:text-navy"
                    }`}
                  >
                    {m.label}
                    {active && (
                      <span aria-hidden="true" className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-orange" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
