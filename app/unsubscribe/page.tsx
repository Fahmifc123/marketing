import type { Metadata } from "next";

import { verifyUnsubscribe } from "@/lib/unsubscribe";

export const metadata: Metadata = { title: "Berhenti berlangganan", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { e = "", t = "", done } = await searchParams;
  const valid = Boolean(e && t && (await verifyUnsubscribe(e, t)));
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">Intelligo ID</p>
      {done ? (
        <>
          <h1 className="mt-3 text-2xl font-bold text-navy">Kamu sudah berhenti berlangganan.</h1>
          <p className="mt-2 text-sm text-muted">Kamu tidak akan menerima email promosi dari kami lagi.</p>
        </>
      ) : valid ? (
        <form method="post" action={`/api/unsubscribe?e=${encodeURIComponent(e)}&t=${encodeURIComponent(t)}`}>
          <h1 className="mt-3 text-2xl font-bold text-navy">Berhenti menerima email dari Intelligo ID?</h1>
          <p className="mt-2 text-sm break-all text-muted">{e}</p>
          <button type="submit" className="btn mt-6 h-12 w-full bg-navy font-bold text-white hover:bg-navy-700">
            Ya, berhenti berlangganan
          </button>
        </form>
      ) : (
        <h1 className="mt-3 text-xl font-bold text-navy">Link tidak valid atau sudah kedaluwarsa.</h1>
      )}
    </main>
  );
}
