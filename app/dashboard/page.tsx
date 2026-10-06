import type { Metadata } from "next";
import { redirect } from "next/navigation";

import Header from "@/components/Header";
import ImageGenerator from "@/components/ImageGenerator";
import { hasValidSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "AI Image",
};

export default async function DashboardPage() {
  if (!(await hasValidSession())) redirect("/login");

  return (
    <>
      <Header activeModule="ai-image" />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-10 pb-16 sm:px-6 lg:pt-14">
        <div className="mb-10 lg:mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
            GOOD TO CREATE<span className="text-orange">.</span>
          </h1>
          <p className="mt-3 text-xl font-medium text-navy sm:text-2xl">What are we making today?</p>
          <p className="mt-2 text-sm text-muted sm:text-base">
            Describe your idea. Intelligo&apos;s visual system will handle the rest.
          </p>
        </div>
        <ImageGenerator />
      </main>
      <footer className="border-t border-line px-4 py-6 text-center text-xs tracking-[0.14em] text-muted uppercase">
        Intelligo ID · Internal Marketing Workspace
      </footer>
    </>
  );
}
