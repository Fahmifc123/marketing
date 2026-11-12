/**
 * Image generation cost (USD), from OpenAI's official docs
 * (developers.openai.com/api/docs/pricing and guides/image-generation,
 * checked 2026-11-12). Billing is per token: text input + image input
 * (reference images) + image output. Rates are USD per 1M tokens.
 *
 * Output tokens per image are only published for the three standard sizes.
 * Custom sizes are scaled by area from the nearest standard size — an upper
 * estimate (OpenAI notes bigger non-square sizes can use FEWER tokens). The
 * browser then calibrates from real usage (see cost-calibration.ts).
 */
import type { Dimensions, QualityId } from "@/types/image";

type Orientation = "square" | "portrait" | "landscape";
type TokenTable = Partial<Record<QualityId, Record<Orientation, number>>>;

export interface ModelRates {
  textIn: number;
  imageIn: number;
  imageOut: number;
  /** Output tokens per standard-size image. */
  outTokens: TokenTable;
  /** False when OpenAI publishes no token counts for this model (we borrow another model's). */
  tokensPublished: boolean;
}

/** GPT-Image-2 per-image costs ($0.006/$0.053/$0.211 square, $0.005/$0.041/$0.165 portrait & landscape) ÷ $30/M. */
const GPT2_TOKENS: TokenTable = {
  low: { square: 200, portrait: 167, landscape: 167 },
  medium: { square: 1767, portrait: 1367, landscape: 1367 },
  high: { square: 7033, portrait: 5500, landscape: 5500 },
};
/** Not published for 2.5: borrow GPT-Image-2 and assume xhigh/max cost more. */
const GPT25_TOKENS: TokenTable = {
  ...GPT2_TOKENS,
  xhigh: { square: 10550, portrait: 8250, landscape: 8250 },
  max: { square: 14066, portrait: 11000, landscape: 11000 },
};
/** "Models prior to gpt-image-2" table. */
const GPT1_TOKENS: TokenTable = {
  low: { square: 272, portrait: 408, landscape: 400 },
  medium: { square: 1056, portrait: 1584, landscape: 1568 },
  high: { square: 4160, portrait: 6240, landscape: 6208 },
};

export const PRICING: Record<string, ModelRates> = {
  "gpt-image-2.5-sunburst": { textIn: 5, imageIn: 8, imageOut: 30, outTokens: GPT25_TOKENS, tokensPublished: false },
  "gpt-image-2.5-flare": { textIn: 5, imageIn: 8, imageOut: 30, outTokens: GPT25_TOKENS, tokensPublished: false },
  "gpt-image-2": { textIn: 5, imageIn: 8, imageOut: 30, outTokens: GPT2_TOKENS, tokensPublished: true },
  "gpt-image-1.5": { textIn: 5, imageIn: 8, imageOut: 32, outTokens: GPT1_TOKENS, tokensPublished: true },
  "gpt-image-1-mini": { textIn: 2, imageIn: 2.5, imageOut: 8, outTokens: GPT1_TOKENS, tokensPublished: true },
};

const STANDARD: Record<Orientation, Dimensions> = {
  square: { width: 1024, height: 1024 },
  portrait: { width: 1024, height: 1536 },
  landscape: { width: 1536, height: 1024 },
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
  /** Rates are OpenAI's published prices. */
  verified: boolean;
}

function rates(modelId: string): ModelRates {
  return PRICING[modelId] ?? PRICING["gpt-image-2"];
}

function orientation(size: Dimensions): Orientation {
  const r = size.width / size.height;
  if (r > 1.15) return "landscape";
  if (r < 0.87) return "portrait";
  return "square";
}

function priceOf(r: ModelRates, textIn: number, imageIn: number, out: number) {
  return (textIn * r.textIn + imageIn * r.imageIn + out * r.imageOut) / 1_000_000;
}

/** Output tokens per pixel learned from real generations (model+quality+orientation key). */
export type Calibration = Record<string, number>;

export const calibrationKey = (model: string, quality: QualityId, size: Dimensions) => `${model}|${quality}|${orientation(size)}`;

/** Estimated output tokens for one image (learned value first, else the published table). */
export function estimateOutTokens(model: string, quality: QualityId, size: Dimensions, calibration?: Calibration): { tokens: number; calibrated: boolean } {
  const pixels = size.width * size.height;
  const learned = calibration?.[calibrationKey(model, quality, size)];
  if (learned) return { tokens: Math.round(learned * pixels), calibrated: true };
  const o = orientation(size);
  const table = rates(model).outTokens;
  const base = (table[quality] ?? table.high!)[o];
  const std = STANDARD[o];
  return { tokens: Math.round(base * (pixels / (std.width * std.height))), calibrated: false };
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
  calibration?: Calibration;
}): CostBreakdown & { calibrated: boolean } {
  const r = rates(input.model);
  const { tokens: outTokens, calibrated } = estimateOutTokens(input.model, input.quality, input.size, input.calibration);
  const textInTokens = Math.round(input.promptChars / 4) + (input.fullPrompt ? 0 : SYSTEM_PROMPT_TOKENS);
  const imageInTokens = input.referenceImages * REFERENCE_IMAGE_TOKENS;
  return { usd: priceOf(r, textInTokens, imageInTokens, outTokens), textInTokens, imageInTokens, outTokens, verified: true, calibrated };
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
    verified: Boolean(PRICING[model]),
  };
}

export function formatUsd(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}
