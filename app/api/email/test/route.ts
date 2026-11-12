import { NextResponse, type NextRequest } from "next/server";

import { errorResponse, guardRequest } from "@/lib/api";
import { EMAIL_LIMITS, EmailValidationError, normalizeCtaUrl, parseEmailDraft } from "@/lib/email-content";
import { resendErrorMessage, sendTestEmail } from "@/lib/resend-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** Sends the exact draft to up to 3 test addresses; returns the token a broadcast requires. */
export async function POST(request: NextRequest) {
  const denied = await guardRequest(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "Request tidak valid.");
  }

  let draft;
  let ctaUrl: string;
  let to: string[];
  try {
    draft = parseEmailDraft(body.draft);
    ctaUrl = normalizeCtaUrl(body.ctaUrl);
    to = (Array.isArray(body.to) ? body.to : [])
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter(Boolean);
    if (to.length === 0) throw new EmailValidationError("Isi alamat email tes.");
    if (to.length > EMAIL_LIMITS.maxTestRecipients) throw new EmailValidationError(`Maksimal ${EMAIL_LIMITS.maxTestRecipients} alamat tes.`);
    if (!to.every((t) => EMAIL_RE.test(t) && t.length <= 254)) throw new EmailValidationError("Alamat email tes tidak valid.");
  } catch (err) {
    return errorResponse(400, "invalid_request", err instanceof EmailValidationError ? err.message : "Request tidak valid.");
  }

  try {
    const { token } = await sendTestEmail(draft, ctaUrl, to);
    return NextResponse.json({ ok: true, token, sentTo: to }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[email-test] send failed", err instanceof Error ? err.name : "unknown");
    const { status, code, message } = resendErrorMessage(err);
    return errorResponse(status, code, message);
  }
}
