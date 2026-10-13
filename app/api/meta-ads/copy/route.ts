import { NextResponse, type NextRequest } from "next/server";

import { ValidationError, errorResponse, guardRequest, validateApiKey } from "@/lib/api";
import { META_ADS_LIMITS } from "@/lib/meta-ads";
import type { MetaCopyResponse } from "@/lib/meta-copy";
import { CopyUnavailableError, writeMetaAdCopy } from "@/lib/meta-copy-writer";
import { logSafeError, toUserFacingError } from "@/lib/openai";
import { CARD_TEXT_LIMITS, EMPTY_CARD_TEXT, type CardText } from "@/lib/text-layout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 200;

function cleanText(value: unknown): CardText {
  const t = (value ?? {}) as Record<string, unknown>;
  const pick = (k: keyof CardText) => (typeof t[k] === "string" ? (t[k] as string).trim().slice(0, CARD_TEXT_LIMITS[k]) : "");
  return { headline: pick("headline"), supporting: pick("supporting"), cta: pick("cta") };
}

/** Writes Ads Manager copy (primary text, card headlines/descriptions, CTA) for a Meta Ads carousel. */
export async function POST(request: NextRequest) {
  const denied = await guardRequest(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "Request tidak valid.");
  }

  let input;
  let apiKey: string;
  try {
    apiKey = validateApiKey(body.apiKey);
    const sharedContext = typeof body.sharedContext === "string" ? body.sharedContext.trim() : "";
    if (sharedContext.length > META_ADS_LIMITS.maxSharedLength) {
      throw new ValidationError("invalid_prompt", "Arahan umum terlalu panjang.");
    }
    const slides = Array.isArray(body.slides) ? body.slides.map((s) => (typeof s === "string" ? s.trim() : "")) : [];
    if (slides.length < 1 || slides.length > META_ADS_LIMITS.maxSlides) {
      throw new ValidationError("invalid_prompt", `Jumlah kartu harus 1–${META_ADS_LIMITS.maxSlides}.`);
    }
    if (slides.some((s) => s.length < META_ADS_LIMITS.minSlideLength || s.length > META_ADS_LIMITS.maxSlideLength)) {
      throw new ValidationError("invalid_prompt", "Ada prompt slide yang kosong atau terlalu panjang.");
    }
    const texts = slides.map((_, i) => (Array.isArray(body.texts) ? cleanText(body.texts[i]) : EMPTY_CARD_TEXT));
    input = { sharedContext, slides, texts };
  } catch (err) {
    if (err instanceof ValidationError) return errorResponse(400, err.code, err.message);
    return errorResponse(400, "invalid_request", "Request tidak valid.");
  }

  try {
    const result = await writeMetaAdCopy({ apiKey, input, signal: request.signal });
    return NextResponse.json<MetaCopyResponse>({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof CopyUnavailableError) {
      return errorResponse(
        503,
        "copy_unavailable",
        "Model teks OpenAI tidak tersedia untuk API key ini. Coba lagi, atau minta admin mengatur CAROUSEL_PLANNER_MODEL.",
      );
    }
    logSafeError("meta-copy", err);
    const { status, code, message } = toUserFacingError(err);
    return errorResponse(status, code, message);
  }
}
