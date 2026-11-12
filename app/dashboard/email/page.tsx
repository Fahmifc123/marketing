import type { Metadata } from "next";
import { redirect } from "next/navigation";

import EmailMarketing from "@/components/EmailMarketing";
import Header from "@/components/Header";
import { hasValidSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "EMAIL MARKETING",
};

export default async function EmailPage() {
  if (!(await hasValidSession())) redirect("/login");

  return (
    <>
      <Header activeModule="email" />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-10 pb-16 sm:px-6 lg:pt-14">
        <div className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
            EMAIL MARKETING<span className="text-orange">.</span>
          </h1>
          <p className="mt-3 text-xl font-medium text-navy sm:text-2xl">Tulis, tes, lalu kirim ke audiens.</p>
          <p className="mt-2 text-sm text-muted sm:text-base">
            Draft bergaya Intelligo ID, kirim email tes dulu, lalu broadcast ke Segment di Resend.
          </p>
        </div>
        <EmailMarketing />
      </main>
      <footer className="border-t border-line px-4 py-6 text-center text-xs tracking-[0.14em] text-muted uppercase">
        Intelligo ID · Internal Marketing Workspace
      </footer>
    </>
  );
}
