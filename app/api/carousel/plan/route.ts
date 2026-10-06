import { NextResponse, type NextRequest } from "next/server";

import {
  ValidationError,
  errorResponse,
  guardRequest,
  validateApiKey,
  validatePrompt,
  validateSettings,
} from "@/lib/api";
import { CAROUSEL_LIMITS, clampSlideCount, detectSlideCount } from "@/lib/carousel";
import { planCarousel } from "@/lib/carousel-planner";
import { resolveFormat } from "@/lib/image-settings";
import { logSafeError, toUserFacingError } from "@/lib/openai";
import type { CarouselPlanResponse } from "@/types/carousel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Planning + one possible revision round. */
export const maxDuration = 200;

/**
 * Step 1 of a multi-slide carousel: the main agent drafts the plan and the
 * verifier checks every slide. Nothing is generated here.
 */
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
  try {
    const apiKey = validateApiKey(body.apiKey);
    const brief = validatePrompt(body.brief);
    const customRatio = body.customRatio as { width?: unknown; height?: unknown } | undefined;
    const settings = validateSettings({
      model: body.model,
      quality: body.quality,
      formatId: body.formatId,
      customWidth: customRatio?.width,
      customHeight: customRatio?.height,
      formatExplicit: true,
    });
    const requested = Number(body.slideCount);
    const slideCount =
      body.slideCount === "auto" || body.slideCount === undefined || body.slideCount === null
        ? (detectSlideCount(brief) ?? CAROUSEL_LIMITS.defaultSlides)
        : clampSlideCount(requested);
    input = {
      apiKey,
      brief,
      slideCount,
      format: resolveFormat({ formatId: settings.formatId, customRatio: settings.customRatio }),
      hasReference: body.hasReference === true,
    };
  } catch (err) {
    if (err instanceof ValidationError) return errorResponse(400, err.code, err.message);
    return errorResponse(400, "invalid_request", "Request tidak valid.");
  }

  try {
    const result = await planCarousel({ ...input, signal: request.signal });
    return NextResponse.json<CarouselPlanResponse>(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    logSafeError("carousel-plan", err);
    const { status, code, message } = toUserFacingError(err);
    return errorResponse(status, code, message);
  }
}
