/**
 * Image generation cost (USD). OpenAI bills GPT image models per token:
 * text input + image input (reference images) + image output.
 *
 * Rates are USD per 1M tokens. `verified: false` means OpenAI has not
 * published a price we could confirm — the number is an assumption and the
 * UI labels it as such. Update this table when OpenAI's pricing page changes.
 */
import type { Dimensions, QualityId } from "@/types/image";

export interface ModelRates {
  textIn: number;
  imageIn: number;
  imageOut: number;
  verified: boolean;
  /** Output tokens for one 1024x1024 image per quality (scaled by pixel area). */
  outTokens1024: Partial<Record<QualityId, number>>;
}

const GPT1_TOKENS = { low: 272, medium: 1056, high: 4160 };
const GPT2_TOKENS = { low: 200, medium: 1770, high: 7030, xhigh: 10500, max: 14000 };

export const PRICING: Record<string, ModelRates> = {
  // Price not published by OpenAI at time of writing — assumed equal to gpt-image-2.
  "gpt-image-2.5-sunburst": { textIn: 5, imageIn: 8, imageOut: 30, verified: false, outTokens1024: GPT2_TOKENS },
  "gpt-image-2.5-flare": { textIn: 5, imageIn: 8, imageOut: 30, verified: false, outTokens1024: GPT2_TOKENS },
  "gpt-image-2": { textIn: 5, imageIn: 8, imageOut: 30, verified: true, outTokens1024: GPT2_TOKENS },
  "gpt-image-1.5": { textIn: 5, imageIn: 8, imageOut: 32, verified: true, outTokens1024: GPT1_TOKENS },
  "gpt-image-1": { textIn: 5, imageIn: 10, imageOut: 40, verified: true, outTokens1024: GPT1_TOKENS },
  "gpt-image-1-mini": { textIn: 2, imageIn: 2.5, imageOut: 8, verified: true, outTokens1024: GPT1_TOKENS },
};

/** Rough input-token cost of one attached reference image. */
const REFERENCE_IMAGE_TOKENS = 1500;
/** Our brand prompt adds roughly this many text tokens on top of the brief. */
const SYSTEM_PROMPT_TOKENS = 1800;

export interface CostBreakdown {
  usd: number;
  textInTokens: number;
  imageInTokens: number;
  outTokens: number;
  verified: boolean;
}

function rates(modelId: string): ModelRates {
  return PRICING[modelId] ?? PRICING["gpt-image-2"];
}

function priceOf(r: ModelRates, textIn: number, imageIn: number, out: number) {
  return (textIn * r.textIn + imageIn * r.imageIn + out * r.imageOut) / 1_000_000;
}

/** Estimate before generating. */
export function estimateImageCost(input: {
  model: string;
  quality: QualityId;
  size: Dimensions;
  promptChars: number;
  referenceImages: number;
  /** promptChars already includes the brand system prompt. */
  fullPrompt?: boolean;
}): CostBreakdown {
  const r = rates(input.model);
  const base = r.outTokens1024[input.quality] ?? r.outTokens1024.high ?? 4160;
  const outTokens = Math.round(base * ((input.size.width * input.size.height) / (1024 * 1024)));
  const textInTokens = Math.round(input.promptChars / 4) + (input.fullPrompt ? 0 : SYSTEM_PROMPT_TOKENS);
  const imageInTokens = input.referenceImages * REFERENCE_IMAGE_TOKENS;
  return { usd: priceOf(r, textInTokens, imageInTokens, outTokens), textInTokens, imageInTokens, outTokens, verified: r.verified };
}

/** Actual cost from the usage OpenAI returned. */
export function actualImageCost(
  model: string,
  usage: { inputTokens?: number; outputTokens?: number; textTokens?: number; imageTokens?: number },
): CostBreakdown | null {
  if (usage.outputTokens === undefined) return null;
  const r = rates(model);
  const input = usage.inputTokens ?? 0;
  const imageIn = usage.imageTokens ?? 0;
  const textIn = usage.textTokens ?? Math.max(0, input - imageIn);
  return {
    usd: priceOf(r, textIn, imageIn, usage.outputTokens),
    textInTokens: textIn,
    imageInTokens: imageIn,
    outTokens: usage.outputTokens,
    verified: r.verified,
  };
}

export function formatUsd(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}
