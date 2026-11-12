import { NextResponse, type NextRequest } from "next/server";

import { guardRequest } from "@/lib/api";
import { emailQuota, remainingQuota } from "@/lib/resend-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resend sending quota (daily / monthly) for the warning in the UI. */
export async function GET(request: NextRequest) {
  const denied = await guardRequest(request);
  if (denied) return denied;
  const quota = await emailQuota();
  return NextResponse.json({ ok: true, quota, remaining: remainingQuota(quota) }, { headers: { "Cache-Control": "no-store" } });
}
