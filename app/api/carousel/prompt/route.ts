import { NextResponse, type NextRequest } from "next/server";

import {
  ValidationError,
  errorResponse,
  guardRequest,
  validateCarouselPlanInput,
  validatePrompt,
  validateSettings,
} from "@/lib/api";
import { resolveFormat } from "@/lib/image-settings";
import { buildCarouselSlidePrompt } from "@/lib/prompt-builder";

export const dynamic = "force-dynamic";

/**
 * Developer Mode only: the exact internal prompt a slide will be generated
 * with, so it can be checked before approval. No API key involved.
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

  try {
    const brief = validatePrompt(body.brief);
    const { plan, slideIndex } = validateCarouselPlanInput(body.plan, body.slideIndex);
    const customRatio = body.customRatio as { width?: unknown; height?: unknown } | undefined;
    const settings = validateSettings({
      model: body.model,
      quality: body.quality,
      formatId: body.formatId,
      customWidth: customRatio?.width,
      customHeight: customRatio?.height,
      formatExplicit: true,
    });
    const prompt = buildCarouselSlidePrompt({
      brief,
      plan,
      slideIndex,
      quality: settings.quality,
      aspectRatio: resolveFormat({ formatId: settings.formatId, customRatio: settings.customRatio }),
      hasStyleAnchor: body.useStyleAnchor === true && slideIndex > 1,
      hasReference: body.hasReference === true,
    });
    return NextResponse.json({ ok: true, prompt }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ValidationError) return errorResponse(400, err.code, err.message);
    return errorResponse(400, "invalid_request", "Request tidak valid.");
  }
}
