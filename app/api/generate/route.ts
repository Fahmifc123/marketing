import { NextResponse, type NextRequest } from "next/server";

import {
  ValidationError,
  errorResponse,
  guardRequest,
  validateApiKey,
  validateCarouselSlide,
  validatePrompt,
  validateReferenceImage,
  validateSettings,
} from "@/lib/api";
import { isStoryPrompt } from "@/lib/content-detection";
import { getModel, PROMPT_LIMITS, resolveFormat } from "@/lib/image-settings";
import { generateImage, logSafeError, toUserFacingError } from "@/lib/openai";
import { analyzeBrief, buildCarouselSlidePrompt, buildIntelligoPrompt } from "@/lib/prompt-builder";
import type { GenerateSuccessResponse } from "@/types/generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** High-quality generations can take several minutes. */
export const maxDuration = 300;

/**
 * Browser → /api/generate → Prompt Builder → OpenAI → browser.
 *
 * Single image: `prompt` is the marketer's brief.
 * Carousel slide: `prompt` is the carousel brief and `carousel` holds the
 * approved plan + slide number; `styleAnchor` is the approved cover.
 *
 * The API key is used for this single request only. It is never stored or logged.
 */
export async function POST(request: NextRequest) {
  const denied = await guardRequest(request);
  if (denied) return denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, "invalid_request", "Request tidak valid. Coba lagi.");
  }

  let parsed;
  try {
    const apiKey = validateApiKey(form.get("apiKey"));
    const prompt = validatePrompt(form.get("prompt"));
    const settings = validateSettings({
      model: form.get("model"),
      quality: form.get("quality"),
      formatId: form.get("formatId"),
      customWidth: form.get("customWidth") ?? undefined,
      customHeight: form.get("customHeight") ?? undefined,
      formatExplicit: form.get("formatExplicit"),
    });
    const reference = await validateReferenceImage(form.get("referenceImage"));
    const carousel = validateCarouselSlide(form.get("carousel"));
    const styleAnchor = carousel ? await validateReferenceImage(form.get("styleAnchor")) : null;
    const developerMode = form.get("developerMode") === "true";

    let promptOverride: string | null = null;
    const override = form.get("promptOverride");
    if (developerMode && typeof override === "string" && override.trim().length > 0) {
      if (override.length > PROMPT_LIMITS.maxOverrideLength) {
        throw new ValidationError("invalid_prompt", "Prompt override terlalu panjang.");
      }
      promptOverride = override.trim();
    }
    parsed = { apiKey, prompt, settings, reference, carousel, styleAnchor, developerMode, promptOverride };
  } catch (err) {
    if (err instanceof ValidationError) return errorResponse(400, err.code, err.message);
    return errorResponse(400, "invalid_request", "Request tidak valid. Coba lagi.");
  }

  const { apiKey, prompt, settings, reference, carousel, styleAnchor, developerMode, promptOverride } = parsed;
  const model = getModel(settings.model)!;
  const format = resolveFormat({
    formatId: settings.formatId,
    customRatio: settings.customRatio,
    autoStory: !carousel && !settings.formatExplicit && isStoryPrompt(prompt),
  });

  const internalPrompt =
    promptOverride ??
    (carousel
      ? buildCarouselSlidePrompt({
          brief: prompt,
          plan: carousel.plan,
          slideIndex: carousel.slideIndex,
          quality: settings.quality,
          aspectRatio: format,
          hasStyleAnchor: Boolean(styleAnchor),
          hasReference: Boolean(reference),
        })
      : buildIntelligoPrompt({
          userPrompt: prompt,
          model: model.id,
          quality: settings.quality,
          aspectRatio: format,
          referenceImage: reference ? { name: reference.displayName } : null,
        }));

  // The style anchor goes first so the prompt can refer to "the first image".
  const references = [styleAnchor, reference].filter((r) => r !== null);
  const slide = carousel?.plan.slides.find((s) => s.index === carousel.slideIndex);

  const startedAt = Date.now();
  try {
    const result = await generateImage({
      apiKey,
      model: model.id,
      prompt: internalPrompt,
      quality: settings.quality,
      size: format.generationSize,
      references,
      signal: request.signal,
    });

    const body: GenerateSuccessResponse = {
      ok: true,
      image: { b64: result.b64, mimeType: result.mimeType },
      meta: {
        model: model.id,
        modelLabel: model.label,
        quality: result.quality,
        requestedQuality: settings.quality,
        format,
        size: result.size,
        outputFormat: result.outputFormat,
        hasReference: Boolean(reference),
        referenceName: reference?.displayName ?? null,
        promptOverride: Boolean(promptOverride),
        contentTypes: carousel ? ["carousel"] : analyzeBrief(prompt).contentTypes,
        durationMs: Date.now() - startedAt,
        createdAt: Date.now(),
        notices: [
          ...(format.autoSelected ? ["Story terdeteksi — format otomatis memakai Instagram Story 9:16."] : []),
          ...result.notices,
        ],
        usage: result.usage,
        ...(carousel && slide
          ? {
              carouselSlide: {
                index: slide.index,
                total: carousel.plan.slides.length,
                role: slide.role,
                styleAnchor: Boolean(styleAnchor),
              },
            }
          : {}),
      },
      ...(developerMode ? { internalPrompt } : {}),
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logSafeError("generate", err);
    const { status, code, message } = toUserFacingError(err);
    return errorResponse(status, code, message);
  }
}
