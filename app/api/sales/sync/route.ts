import { NextResponse, type NextRequest } from "next/server";

import { errorResponse, guardRequest } from "@/lib/api";
import { MayarConfigError, syncSales } from "@/lib/mayar-server";
import { PrivateStoreConfigError } from "@/lib/private-blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Pulls new (and more historical) transactions from Mayar. Read-only on Mayar. */
export async function POST(request: NextRequest) {
  const denied = await guardRequest(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ ok: true, ...(await syncSales(40_000)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof MayarConfigError || err instanceof PrivateStoreConfigError) return errorResponse(503, "not_configured", err.message);
    console.error("[sales] sync failed", (err as Error)?.name, String((err as Error)?.message).slice(0, 160));
    return errorResponse(502, "sync_failed", "Sinkron dengan Mayar gagal. Coba lagi.");
  }
}
