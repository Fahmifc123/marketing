import { NextResponse, type NextRequest } from "next/server";

import { ValidationError, errorResponse, guardRequest, resolveApiKey } from "@/lib/api";
import { EMAIL_LIMITS, EmailValidationError, isEmailType, normalizeCtaUrl } from "@/lib/email-content";
import { EmailWriterUnavailableError, writeEmailDraft } from "@/lib/email-writer";
import { logSafeError, toUserFacingError } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 200;

/** Writes a marketing email draft from a brief (OpenAI text model, user's key). */
export async function POST(request: NextRequest) {
  const denied = await guardRequest(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "Request tidak valid.");
  }

  let apiKey: string;
  let input;
  try {
    apiKey = resolveApiKey(body.apiKey);
    const brief = typeof body.brief === "string" ? body.brief.trim() : "";
    if (brief.length < 10) throw new ValidationError("invalid_prompt", "Tulis brief email minimal 10 karakter.");
    if (brief.length > EMAIL_LIMITS.briefMax) throw new ValidationError("invalid_prompt", "Brief terlalu panjang.");
    const emailType = isEmailType(body.emailType) ? body.emailType : "promo";
    input = { brief, emailType, ctaUrl: normalizeCtaUrl(body.ctaUrl) };
  } catch (err) {
    if (err instanceof ValidationError || err instanceof EmailValidationError) {
      return errorResponse(400, err instanceof ValidationError ? err.code : "invalid_cta_url", err.message);
    }
    return errorResponse(400, "invalid_request", "Request tidak valid.");
  }

  try {
    const result = await writeEmailDraft({ apiKey, input, signal: request.signal });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof EmailWriterUnavailableError) {
      return errorResponse(503, "writer_unavailable", "Model teks OpenAI tidak tersedia untuk API key ini. Coba lagi atau atur CAROUSEL_PLANNER_MODEL.");
    }
    logSafeError("email-generate", err);
    const { status, code, message } = toUserFacingError(err);
    return errorResponse(status, code, message);
  }
}
