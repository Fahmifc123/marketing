import { NextResponse, type NextRequest } from "next/server";

import { markUnsubscribed } from "@/lib/contact-store";
import { verifyUnsubscribe } from "@/lib/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One-click unsubscribe (form on /unsubscribe and the List-Unsubscribe-Post header). Public, signed link only. */
export async function POST(request: NextRequest) {
  const e = request.nextUrl.searchParams.get("e") ?? "";
  const t = request.nextUrl.searchParams.get("t") ?? "";
  if (!e || !t || !(await verifyUnsubscribe(e, t))) return NextResponse.json({ ok: false }, { status: 400 });
  await markUnsubscribed(e);
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) return NextResponse.redirect(new URL(`/unsubscribe?done=1`, request.url), 303);
  return NextResponse.json({ ok: true });
}
