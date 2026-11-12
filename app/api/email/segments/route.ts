import { NextResponse, type NextRequest } from "next/server";

import { errorResponse, guardRequest } from "@/lib/api";
import { MAX_COUNTED_CONTACTS, listSegments, resendErrorMessage } from "@/lib/resend-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Resend segments with their subscribed recipient counts. */
export async function GET(request: NextRequest) {
  const denied = await guardRequest(request);
  if (denied) return denied;
  try {
    const segments = await listSegments();
    return NextResponse.json({ ok: true, segments, maxCounted: MAX_COUNTED_CONTACTS }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, code, message } = resendErrorMessage(err);
    return errorResponse(status, code, message);
  }
}
