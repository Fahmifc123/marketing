import { NextResponse, type NextRequest } from "next/server";

import { ValidationError, errorResponse, guardRequest, validatePrompt, validateSettings } from "@/lib/api";
import { isStoryPrompt } from "@/lib/content-detection";
import { resolveFormat } from "@/lib/image-settings";
import { isLogoCorner } from "@/lib/logo-placement";
import { SPEAKER_LIMITS, isContentMode, parseSpeakers } from "@/lib/speakers";
import { analyzeBrief, buildIntelligoPrompt } from "@/lib/prompt-builder";
import type { PromptPreviewResponse } from "@/types/generation";

export const dynamic = "force-dynamic";

/**
 * Developer Mode only: returns the internal prompt that would be sent to the
 * image model. Requires an authenticated session. No API key involved.
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
    const prompt = validatePrompt(body.prompt);
    const customRatio = body.customRatio as { width?: unknown; height?: unknown } | undefined;
    const settings = validateSettings({
      model: body.model,
      quality: body.quality,
      formatId: body.formatId,
      customWidth: customRatio?.width,
      customHeight: customRatio?.height,
      formatExplicit: body.formatExplicit,
    });
    const format = resolveFormat({
      formatId: settings.formatId,
      customRatio: settings.customRatio,
      autoStory: !settings.formatExplicit && isStoryPrompt(prompt),
    });
    const internalPrompt = buildIntelligoPrompt({
      userPrompt: prompt,
      model: settings.model,
      quality: settings.quality,
      aspectRatio: format,
      referenceImage: body.hasReference === true ? {} : null,
      logoCorner: isLogoCorner(body.logoCorner) ? body.logoCorner : null,
      contentMode: isContentMode(body.contentMode) ? body.contentMode : "general",
      speakers: isContentMode(body.contentMode) && body.contentMode === "class" ? parseSpeakers(JSON.stringify(body.speakers ?? []), Math.min(Number(body.speakerCount) || 0, SPEAKER_LIMITS.max)) : [],
    });
    return NextResponse.json<PromptPreviewResponse>(
      { ok: true, prompt: internalPrompt, format, contentTypes: analyzeBrief(prompt).contentTypes },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof ValidationError) return errorResponse(400, err.code, err.message);
    return errorResponse(400, "invalid_request", "Request tidak valid.");
  }
}
