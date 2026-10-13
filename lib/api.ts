/**
 * Shared helpers for API route handlers: auth guard, JSON responses and
 * request validation.
 */
import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, isSameOriginRequest, verifySessionToken } from "@/lib/auth";
import { PlanValidationError, parseCarouselPlan } from "@/lib/carousel";
import { META_ADS_LIMITS } from "@/lib/meta-ads";
import {
  DEFAULT_CUSTOM_RATIO,
  PROMPT_LIMITS,
  REFERENCE_IMAGE,
  getFormatPreset,
  getModel,
  isQualityId,
  isValidCustomRatio,
} from "@/lib/image-settings";
import type { CarouselPlan } from "@/types/carousel";
import type { ApiErrorResponse, GenerationSettings } from "@/types/generation";
import type { CustomRatio, FormatId } from "@/types/image";

export function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json<ApiErrorResponse>(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** Returns an error response if the request is cross-site or has no valid session. */
export async function guardRequest(request: NextRequest): Promise<NextResponse | null> {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "forbidden", "Request tidak diizinkan.");
  }
  if (!(await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value))) {
    return errorResponse(401, "unauthorized", "Sesi kamu sudah berakhir. Masuk kembali dengan access code.");
  }
  return null;
}

export class ValidationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function validatePrompt(value: unknown): string {
  const prompt = typeof value === "string" ? value.trim() : "";
  if (prompt.length < PROMPT_LIMITS.minLength) {
    throw new ValidationError("invalid_prompt", "Tulis dulu apa yang ingin kamu buat.");
  }
  if (prompt.length > PROMPT_LIMITS.maxLength) {
    throw new ValidationError("invalid_prompt", `Prompt terlalu panjang (maksimal ${PROMPT_LIMITS.maxLength} karakter).`);
  }
  return prompt;
}

export function validateApiKey(value: unknown): string {
  const key = typeof value === "string" ? value.trim() : "";
  if (!key) throw new ValidationError("missing_api_key", "Masukkan OpenAI API key terlebih dahulu.");
  if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(key)) {
    throw new ValidationError("invalid_api_key", "API key tidak valid. Periksa kembali API key kamu.");
  }
  return key;
}

function parseCustomRatio(width: unknown, height: unknown): CustomRatio {
  if (width === undefined && height === undefined) return DEFAULT_CUSTOM_RATIO;
  const ratio = { width: Number(width), height: Number(height) };
  if (!isValidCustomRatio(ratio)) {
    throw new ValidationError("unsupported_size", "Rasio custom harus antara 1:3 dan 3:1.");
  }
  return ratio;
}

export function validateSettings(input: {
  model: unknown;
  quality: unknown;
  formatId: unknown;
  customWidth?: unknown;
  customHeight?: unknown;
  formatExplicit?: unknown;
}): GenerationSettings {
  if (typeof input.model !== "string" || !getModel(input.model)) {
    throw new ValidationError("unsupported_model", "Model tidak didukung. Pilih model lain.");
  }
  if (!isQualityId(input.quality)) {
    throw new ValidationError("unsupported_quality", "Kualitas tidak didukung. Pilih kualitas lain.");
  }
  if (typeof input.formatId !== "string" || !getFormatPreset(input.formatId)) {
    throw new ValidationError("unsupported_size", "Format tidak didukung. Pilih format lain.");
  }
  const formatId = input.formatId as FormatId;
  const customRatio = formatId === "custom" ? parseCustomRatio(input.customWidth, input.customHeight) : DEFAULT_CUSTOM_RATIO;
  return {
    model: input.model,
    quality: input.quality,
    formatId,
    customRatio,
    formatExplicit: input.formatExplicit === true || input.formatExplicit === "true",
  };
}

function detectImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function validateReferenceImage(value: FormDataEntryValue | null) {
  if (value === null || typeof value === "string" || value.size === 0) return null;
  if (value.size > REFERENCE_IMAGE.maxBytes) {
    throw new ValidationError("invalid_reference", "Gambar referensi terlalu besar (maksimal 4 MB).");
  }
  const data = new Uint8Array(await value.arrayBuffer());
  const type = detectImageType(data);
  if (!type || !(REFERENCE_IMAGE.acceptedTypes as readonly string[]).includes(type)) {
    throw new ValidationError("invalid_reference", "Format gambar tidak didukung. Gunakan PNG, JPG, atau WEBP.");
  }
  const baseName = (value.name || "reference").replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-").slice(0, 60) || "reference";
  return {
    data,
    type,
    name: `${baseName}.${EXTENSIONS[type]}`,
    displayName: (value.name || "reference").slice(0, 120),
  };
}

/** Validates an approved carousel plan + slide number sent by the browser. */
export function validateCarouselPlanInput(planInput: unknown, slideIndex?: unknown): { plan: CarouselPlan; slideIndex: number } {
  let plan: CarouselPlan;
  try {
    plan = parseCarouselPlan(planInput);
  } catch (err) {
    throw new ValidationError("invalid_plan", err instanceof PlanValidationError ? err.message : "Rencana carousel tidak valid.");
  }
  const index = Number(slideIndex ?? 1);
  if (!Number.isInteger(index) || index < 1 || index > plan.slides.length) {
    throw new ValidationError("invalid_plan", "Nomor slide tidak valid.");
  }
  return { plan, slideIndex: index };
}

/** Parses the optional `carousel` form field: JSON `{ plan, slideIndex }`. */
export function validateCarouselSlide(value: FormDataEntryValue | null) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 64_000) {
    throw new ValidationError("invalid_plan", "Rencana carousel tidak valid.");
  }
  let data: { plan?: unknown; slideIndex?: unknown };
  try {
    data = JSON.parse(value);
  } catch {
    throw new ValidationError("invalid_plan", "Rencana carousel tidak valid.");
  }
  return validateCarouselPlanInput(data.plan, data.slideIndex);
}

export interface MetaAdSlideInput {
  sharedContext: string;
  slidePrompt: string;
  slideIndex: number;
  totalSlides: number;
}

/** Validates one Meta Ads card: pasted shared context + slide prompt + position. */
export function validateMetaAdInput(input: unknown): MetaAdSlideInput {
  const data = (input ?? {}) as Record<string, unknown>;
  const sharedContext = typeof data.sharedContext === "string" ? data.sharedContext.trim() : "";
  const slidePrompt = typeof data.slidePrompt === "string" ? data.slidePrompt.trim() : "";
  const slideIndex = Number(data.slideIndex);
  const totalSlides = Number(data.totalSlides);

  if (sharedContext.length > META_ADS_LIMITS.maxSharedLength) {
    throw new ValidationError("invalid_prompt", "Bagian prompt umum terlalu panjang.");
  }
  if (slidePrompt.length < META_ADS_LIMITS.minSlideLength) {
    throw new ValidationError("invalid_prompt", "Prompt slide kosong.");
  }
  if (slidePrompt.length > META_ADS_LIMITS.maxSlideLength) {
    throw new ValidationError("invalid_prompt", `Prompt slide terlalu panjang (maks ${META_ADS_LIMITS.maxSlideLength} karakter).`);
  }
  if (
    !Number.isInteger(totalSlides) ||
    totalSlides < 1 ||
    totalSlides > META_ADS_LIMITS.maxSlides ||
    !Number.isInteger(slideIndex) ||
    slideIndex < 1 ||
    slideIndex > totalSlides
  ) {
    throw new ValidationError("invalid_prompt", "Nomor slide tidak valid.");
  }
  return { sharedContext, slidePrompt, slideIndex, totalSlides };
}

/** Parses the optional `metaAd` form field (JSON). */
export function validateMetaAdField(value: FormDataEntryValue | null): MetaAdSlideInput | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 20_000) {
    throw new ValidationError("invalid_prompt", "Prompt Meta Ads tidak valid.");
  }
  try {
    return validateMetaAdInput(JSON.parse(value));
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError("invalid_prompt", "Prompt Meta Ads tidak valid.");
  }
}
