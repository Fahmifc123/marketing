import { NextResponse, type NextRequest } from "next/server";

import { guardRequest, hasServerApiKey } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Non-secret capability flags for the UI (never the key itself). */
export async function GET(request: NextRequest) {
  const denied = await guardRequest(request);
  if (denied) return denied;
  return NextResponse.json({ ok: true, serverApiKey: hasServerApiKey() }, { headers: { "Cache-Control": "no-store" } });
}
