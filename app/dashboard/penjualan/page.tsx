import type { Metadata } from "next";
import { redirect } from "next/navigation";

import SalesDashboard from "@/components/SalesDashboard";
import Header from "@/components/Header";
import { hasValidSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "DASHBOARD MAYAR (PENJUALAN)",
};

export default async function SalesPage() {
  if (!(await hasValidSession())) redirect("/login");

  return (
    <>
      <Header activeModule="sales" />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-10 pb-16 sm:px-6 lg:pt-14">
        <div className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
            DASHBOARD MAYAR (PENJUALAN)<span className="text-orange">.</span>
          </h1>
          <p className="mt-3 text-xl font-medium text-navy sm:text-2xl">Pergerakan dana masuk dari Mayar.</p>
          <p className="mt-2 text-sm text-muted sm:text-base">
            Transparan untuk tim marketing: kotor, fee, dan neto per hari, bulan, dan produk.
          </p>
        </div>
        <SalesDashboard />
      </main>
      <footer className="border-t border-line px-4 py-6 text-center text-xs tracking-[0.14em] text-muted uppercase">
        Intelligo ID · Internal Marketing Workspace
      </footer>
    </>
  );
}
