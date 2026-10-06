import type { Metadata } from "next";
import { redirect } from "next/navigation";

import AccessGate from "@/components/AccessGate";
import { hasValidSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Access",
};

export default async function LoginPage() {
  if (await hasValidSession()) redirect("/dashboard");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6">
      <div className="w-full max-w-[420px]">
        <div className="mb-10">
          <p className="text-sm font-semibold tracking-[0.22em] text-navy">INTELLIGO ID</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-navy sm:text-5xl">
            MARKETING KIT<span className="text-orange">.</span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted">
            Your creative workspace for marketing, content, and campaign production.
          </p>
        </div>
        <AccessGate />
      </div>
      <footer className="mt-16 text-xs font-medium tracking-[0.14em] text-muted uppercase">
        Internal Marketing Workspace
      </footer>
    </main>
  );
}
