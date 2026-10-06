/**
 * Carousel structure, limits and plan validation.
 * Shared by the server (planner, API routes) and the browser (review UI).
 * Contains no internal prompt text.
 */
import type { FunnelStage } from "@/types/generation";
import {
  SLIDE_ROLES,
  type CarouselPlan,
  type CarouselSlidePlan,
  type CarouselStyleGuide,
  type SlideRole,
} from "@/types/carousel";

export const CAROUSEL_LIMITS = {
  minSlides: 3,
  maxSlides: 8,
  defaultSlides: 6,
  /** Parallel image requests (keeps us under typical OpenAI image rate limits). */
  concurrency: 3,
  /** The approved cover is downsized to this edge before being used as a style reference. */
  anchorMaxEdge: 1024,
  fields: {
    topic: 200,
    audience: 200,
    headline: 120,
    supportingText: 300,
    visualConcept: 800,
    subject: 200,
    style: 400,
  },
} as const;

/** Story skeleton for N slides, condensed from the full 8-step flow. */
const SKELETONS: Record<number, SlideRole[]> = {
  3: ["HOOK", "SOLUTION", "CTA"],
  4: ["HOOK", "PROBLEM", "SOLUTION", "CTA"],
  5: ["HOOK", "PROBLEM", "INSIGHT", "SOLUTION", "CTA"],
  6: ["HOOK", "PROBLEM", "INSIGHT", "SOLUTION", "BENEFITS", "CTA"],
  7: ["HOOK", "PROBLEM", "INSIGHT", "SOLUTION", "PROGRAM", "BENEFITS", "CTA"],
  8: [...SLIDE_ROLES],
};

export function clampSlideCount(n: number): number {
  if (!Number.isFinite(n)) return CAROUSEL_LIMITS.defaultSlides;
  return Math.min(CAROUSEL_LIMITS.maxSlides, Math.max(CAROUSEL_LIMITS.minSlides, Math.round(n)));
}

export function rolesForCount(n: number): SlideRole[] {
  return SKELETONS[clampSlideCount(n)];
}

/** Reads "6 slide", "carousel 5 slides", "8 halaman" from a brief. */
export function detectSlideCount(brief: string): number | null {
  const m = brief.match(/\b(\d{1,2})\s*(?:slide|slides|halaman|page|pages|frame)\b/i);
  if (!m) return null;
  return clampSlideCount(Number(m[1]));
}

export const FUNNEL_STAGES: FunnelStage[] = ["cold", "warm", "retargeting"];

const STYLE_KEYS: Array<keyof CarouselStyleGuide> = [
  "artDirection",
  "background",
  "typography",
  "layoutGrid",
  "recurringMotif",
];

export class PlanValidationError extends Error {}

function str(value: unknown, max: number, field: string, allowEmpty = true): string {
  if (typeof value !== "string") throw new PlanValidationError(`Field "${field}" tidak valid.`);
  const v = value.trim();
  if (!allowEmpty && !v) throw new PlanValidationError(`Field "${field}" wajib diisi.`);
  if (v.length > max) throw new PlanValidationError(`Field "${field}" terlalu panjang (maks ${max} karakter).`);
  return v;
}

/**
 * Validates an untrusted plan (from the planner model or the browser) and
 * normalizes slide numbers. Roles must follow the skeleton for the slide count.
 */
export function parseCarouselPlan(input: unknown): CarouselPlan {
  if (!input || typeof input !== "object") throw new PlanValidationError("Rencana carousel tidak valid.");
  const raw = input as Record<string, unknown>;
  const { fields } = CAROUSEL_LIMITS;

  const funnelStage = FUNNEL_STAGES.includes(raw.funnelStage as FunnelStage) ? (raw.funnelStage as FunnelStage) : "cold";

  const styleRaw = (raw.style ?? {}) as Record<string, unknown>;
  const style = Object.fromEntries(
    STYLE_KEYS.map((k) => [k, str(styleRaw[k], fields.style, `style.${k}`, false)]),
  ) as unknown as CarouselStyleGuide;

  if (!Array.isArray(raw.slides)) throw new PlanValidationError("Daftar slide tidak valid.");
  const count = raw.slides.length;
  if (count < CAROUSEL_LIMITS.minSlides || count > CAROUSEL_LIMITS.maxSlides) {
    throw new PlanValidationError(`Jumlah slide harus ${CAROUSEL_LIMITS.minSlides}–${CAROUSEL_LIMITS.maxSlides}.`);
  }
  const roles = rolesForCount(count);

  const slides: CarouselSlidePlan[] = raw.slides.map((s, i) => {
    const slide = (s ?? {}) as Record<string, unknown>;
    return {
      index: i + 1,
      role: roles[i],
      headline: str(slide.headline, fields.headline, `slides[${i}].headline`),
      supportingText: str(slide.supportingText, fields.supportingText, `slides[${i}].supportingText`),
      visualConcept: str(slide.visualConcept, fields.visualConcept, `slides[${i}].visualConcept`, false),
      subject: str(slide.subject, fields.subject, `slides[${i}].subject`),
      ...(slide.edited === true ? { edited: true } : {}),
    };
  });

  return {
    topic: str(raw.topic ?? "", fields.topic, "topic"),
    audience: str(raw.audience ?? "", fields.audience, "audience"),
    funnelStage,
    style,
    slides,
  };
}
