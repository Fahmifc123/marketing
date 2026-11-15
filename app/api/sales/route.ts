import { NextResponse, type NextRequest } from "next/server";

import { errorResponse, guardRequest } from "@/lib/api";
import { readSales } from "@/lib/mayar-server";
import { PrivateStoreConfigError } from "@/lib/private-blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stored Mayar sales (buyer first names only). */
export async function GET(request: NextRequest) {
  const denied = await guardRequest(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ ok: true, ...(await readSales()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof PrivateStoreConfigError) return errorResponse(503, "store_not_configured", err.message);
    console.error("[sales] read failed", (err as Error)?.name);
    return errorResponse(502, "sales_failed", "Gagal membaca data penjualan.");
  }
}
