import { NextResponse, type NextRequest } from "next/server";

import { guardRequest } from "@/lib/api";
import { emailConfig } from "@/lib/resend-server";

export const dynamic = "force-dynamic";

/** Whether sending is configured, and the (non-secret) sender address. */
export async function GET(request: NextRequest) {
  const denied = await guardRequest(request);
  if (denied) return denied;
  const { ready, from, replyTo } = emailConfig();
  return NextResponse.json(
    { ok: true, ready, from: from ?? null, replyTo: replyTo ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
