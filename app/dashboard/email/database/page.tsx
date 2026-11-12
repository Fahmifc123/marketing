import type { Metadata } from "next";
import { redirect } from "next/navigation";

import EmailDatabase from "@/components/EmailDatabase";
import Header from "@/components/Header";
import { hasValidSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "DATABASE EMAIL",
};

export default async function EmailDatabasePage() {
  if (!(await hasValidSession())) redirect("/login");

  return (
    <>
      <Header activeModule="email-db" />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-10 pb-16 sm:px-6 lg:pt-14">
        <div className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
            DATABASE EMAIL<span className="text-orange">.</span>
          </h1>
          <p className="mt-3 text-xl font-medium text-navy sm:text-2xl">Simpan kontak, atur kategori &amp; tag.</p>
          <p className="mt-2 text-sm text-muted sm:text-base">
            Kontak tersimpan di Resend. Pilih kategori/tag saat mengirim di menu Email Marketing.
          </p>
        </div>
        <EmailDatabase />
      </main>
      <footer className="border-t border-line px-4 py-6 text-center text-xs tracking-[0.14em] text-muted uppercase">
        Intelligo ID · Internal Marketing Workspace
      </footer>
    </>
  );
}
