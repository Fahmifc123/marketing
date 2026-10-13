/**
 * Meta Ads copy (Ads Manager fields) for a carousel: shared primary text
 * variants, per-card headline + description, and a standard CTA button.
 * Shared by the server (writer + validation) and the browser (counters,
 * live verification). Contains no internal prompt text.
 */
import { findOverclaim, findUnsupportedFacts } from "@/lib/carousel-verifier";
import type { CardText } from "@/lib/text-layout";

/** Recommended lengths before Meta truncates the text in most placements. */
export const META_COPY_LIMITS = {
  primaryText: 125,
  headline: 40,
  description: 30,
  /** Hard caps for validation (well above the recommendations). */
  max: { primaryText: 600, headline: 120, description: 120 },
  primaryVariants: 3,
} as const;

/** Standard Meta call-to-action button types (as named in Ads Manager). */
export const META_CTA_BUTTONS = [
  "Learn More",
  "Sign Up",
  "Apply Now",
  "Subscribe",
  "Contact Us",
  "Send WhatsApp Message",
  "Send Message",
  "Get Offer",
  "Book Now",
  "Download",
] as const;

export type MetaCtaButton = (typeof META_CTA_BUTTONS)[number];

export interface MetaCardCopy {
  headline: string;
  description: string;
}

export interface MetaAdCopy {
  primaryTexts: string[];
  cards: MetaCardCopy[];
  ctaButton: MetaCtaButton;
  /** One short sentence on why this CTA fits. */
  ctaReason: string;
}

export interface CopyIssue {
  /** "primary-0", "card-2-headline", … */
  field: string;
  severity: "error" | "warning";
  message: string;
}

export interface MetaCopyResponse {
  ok: true;
  copy: MetaAdCopy;
  issues: CopyIssue[];
  model: string;
  revisions: number;
}

export interface MetaCopyInput {
  sharedContext: string;
  slides: string[];
  texts: CardText[];
}

/** Everything the marketer wrote — the only allowed source of facts. */
export function copySource(input: MetaCopyInput): string {
  return [input.sharedContext, ...input.slides, ...input.texts.flatMap((t) => [t.headline, t.supporting, t.cta])]
    .filter(Boolean)
    .join("\n");
}

export class CopyValidationError extends Error {}

function text(value: unknown, max: number, field: string): string {
  if (typeof value !== "string") throw new CopyValidationError(`Field "${field}" tidak valid.`);
  const v = value.trim();
  if (v.length > max) throw new CopyValidationError(`Field "${field}" terlalu panjang.`);
  return v;
}

/** Validates untrusted copy (from the model) for an expected number of cards. */
export function parseMetaAdCopy(input: unknown, cardCount: number): MetaAdCopy {
  if (!input || typeof input !== "object") throw new CopyValidationError("Copy tidak valid.");
  const raw = input as Record<string, unknown>;
  const { max } = META_COPY_LIMITS;

  if (!Array.isArray(raw.primaryTexts) || raw.primaryTexts.length === 0) {
    throw new CopyValidationError("Primary text kosong.");
  }
  const primaryTexts = raw.primaryTexts
    .slice(0, META_COPY_LIMITS.primaryVariants)
    .map((t, i) => text(t, max.primaryText, `primaryTexts[${i}]`))
    .filter(Boolean);
  if (primaryTexts.length === 0) throw new CopyValidationError("Primary text kosong.");

  if (!Array.isArray(raw.cards) || raw.cards.length !== cardCount) {
    throw new CopyValidationError("Jumlah copy kartu tidak sesuai.");
  }
  const cards = raw.cards.map((c, i) => {
    const card = (c ?? {}) as Record<string, unknown>;
    return {
      headline: text(card.headline, max.headline, `cards[${i}].headline`),
      description: text(card.description ?? "", max.description, `cards[${i}].description`),
    };
  });

  const ctaButton = META_CTA_BUTTONS.includes(raw.ctaButton as MetaCtaButton) ? (raw.ctaButton as MetaCtaButton) : "Learn More";
  const ctaReason = typeof raw.ctaReason === "string" ? raw.ctaReason.trim().slice(0, 200) : "";
  return { primaryTexts, cards, ctaButton, ctaReason };
}

/**
 * Checks every field: invented facts / overclaims (errors) and Meta's
 * recommended lengths (warnings). `source` is everything the marketer wrote.
 */
export function verifyMetaAdCopy(copy: MetaAdCopy, source: string): CopyIssue[] {
  const issues: CopyIssue[] = [];
  const check = (field: string, value: string, limit: number, label: string) => {
    if (!value) return;
    const facts = findUnsupportedFacts(value, source);
    if (facts.length) {
      issues.push({ field, severity: "error", message: `${label}: fakta tidak ada di brief — ${facts.join(", ")}.` });
    }
    const claim = findOverclaim(value, source);
    if (claim) issues.push({ field, severity: "error", message: `${label}: klaim berlebihan "${claim}".` });
    if (value.length > limit) {
      issues.push({ field, severity: "warning", message: `${label}: ${value.length}/${limit} karakter — bisa terpotong.` });
    }
  };
  copy.primaryTexts.forEach((t, i) => check(`primary-${i}`, t, META_COPY_LIMITS.primaryText, `Primary text ${i + 1}`));
  copy.cards.forEach((c, i) => {
    check(`card-${i}-headline`, c.headline, META_COPY_LIMITS.headline, `Kartu ${i + 1} headline`);
    check(`card-${i}-description`, c.description, META_COPY_LIMITS.description, `Kartu ${i + 1} description`);
  });
  return issues;
}

/** Plain-text block for pasting into a doc or chat (one section per field). */
export function formatCopyForAdsManager(copy: MetaAdCopy, primaryIndex = 0): string {
  const lines = [
    "PRIMARY TEXT",
    copy.primaryTexts[primaryIndex] ?? copy.primaryTexts[0] ?? "",
    "",
    ...copy.cards.flatMap((c, i) => [`KARTU ${i + 1}`, `Headline: ${c.headline}`, `Description: ${c.description}`, ""]),
    `CTA BUTTON: ${copy.ctaButton}`,
  ];
  return lines.join("\n").trim();
}
