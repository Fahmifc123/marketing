/**
 * App-rendered ad copy.
 *
 * When text overlay is on, the image model renders NO text. It keeps a calm
 * "text zone" free, and the browser typesets the headline, supporting line
 * and CTA there with the brand font — always spelled exactly as written and
 * editable without regenerating. Shared by the server (prompt) and the
 * browser (renderer) so both use the same geometry.
 */
import { extractExactText } from "@/lib/content-detection";
import { logoZone, type LogoCorner, type LogoZone } from "@/lib/logo-placement";

export type TextLayout = "bottom" | "top";

export const TEXT_LAYOUTS: Array<{ id: TextLayout; label: string }> = [
  { id: "bottom", label: "Teks di bawah" },
  { id: "top", label: "Teks di atas" },
];

export function isTextLayout(value: unknown): value is TextLayout {
  return value === "bottom" || value === "top";
}

export interface CardText {
  headline: string;
  supporting: string;
  cta: string;
}

export const EMPTY_CARD_TEXT: CardText = { headline: "", supporting: "", cta: "" };

export const CARD_TEXT_LIMITS = { headline: 90, supporting: 160, cta: 40 } as const;

export function hasCardText(text: CardText): boolean {
  return Boolean(text.headline.trim() || text.supporting.trim() || text.cta.trim());
}

const SIDE_MARGIN = 0.07;

/**
 * Text zone (fractions of the image). Avoids the logo zone and, for 9:16,
 * Meta's Stories/Reels interface areas (top 14%, bottom 20%).
 */
export function textZone(layout: TextLayout, width: number, height: number, logoCorner: LogoCorner | null): LogoZone {
  const vertical = height / width > 1.6;
  let top: number;
  let bottom: number;
  if (layout === "bottom") {
    top = vertical ? 0.5 : 0.56;
    bottom = vertical ? 0.78 : 0.93;
  } else {
    top = vertical ? 0.16 : 0.07;
    bottom = vertical ? 0.46 : 0.42;
  }

  if (logoCorner) {
    const logo = logoZone(logoCorner, width, height);
    const gap = 0.02;
    const logoTop = logo.y;
    const logoBottom = logo.y + logo.height;
    // Shrink the zone vertically so it never overlaps the logo.
    if (logoBottom > top && logoTop < bottom) {
      if (logoCorner.startsWith("top")) top = Math.max(top, logoBottom + gap);
      else bottom = Math.min(bottom, logoTop - gap);
    }
  }

  return { x: SIDE_MARGIN, y: top, width: 1 - SIDE_MARGIN * 2, height: Math.max(0.1, bottom - top) };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function describeTextZone(layout: TextLayout, width: number, height: number, logoCorner: LogoCorner | null): string {
  const z = textZone(layout, width, height, logoCorner);
  return `a full-width band from ${pct(z.y)} to ${pct(z.y + z.height)} of the image height (${layout === "bottom" ? "lower" : "upper"} part of the frame)`;
}

const LABELS = {
  headline: /(headline|judul|heading|title)\s*[:\-–—]?\s*$/i,
  supporting: /(teks pendukung|subheadline|sub-headline|subjudul|sub|body|teks kecil|deskripsi|caption|supporting(?: text| line)?)\s*[:\-–—]?\s*$/i,
  // Allows a few words in between, e.g. `tombol oranye bertuliskan "…"`.
  cta: /\b(tombol|button|cta|call to action|ajakan)(?:\s+[\p{L}-]+){0,3}\s*[:\-–—]?\s*$/iu,
};

/**
 * Pulls on-image copy from a pasted card prompt. Uses labels like
 * `Headline "…"`, `Teks pendukung "…"`, `Tombol "…"`; unlabeled quotes fill
 * headline then supporting text in order.
 */
export function extractCardText(prompt: string): CardText {
  const result: CardText = { ...EMPTY_CARD_TEXT };
  const unlabeled: string[] = [];
  const re = /"([^"\n]{1,200})"|“([^”\n]{1,200})”/g;
  for (const m of prompt.matchAll(re)) {
    const text = (m[1] ?? m[2] ?? "").trim();
    if (!text) continue;
    const before = prompt.slice(Math.max(0, (m.index ?? 0) - 40), m.index);
    // Strict labels (directly before the quote) win over the looser CTA label.
    if (!result.headline && LABELS.headline.test(before)) result.headline = text;
    else if (!result.supporting && LABELS.supporting.test(before)) result.supporting = text;
    else if (!result.cta && LABELS.cta.test(before)) result.cta = text;
    else unlabeled.push(text);
  }
  for (const text of unlabeled) {
    if (!result.headline) result.headline = text;
    else if (!result.supporting) result.supporting = text;
  }
  return {
    headline: result.headline.slice(0, CARD_TEXT_LIMITS.headline),
    supporting: result.supporting.slice(0, CARD_TEXT_LIMITS.supporting),
    cta: result.cta.slice(0, CARD_TEXT_LIMITS.cta),
  };
}

/** Replaces quoted on-image copy so the image model is not tempted to render it. */
export function stripQuotedCopy(prompt: string): string {
  if (extractExactText(prompt).length === 0) return prompt;
  return prompt.replace(/"[^"\n]{1,200}"|“[^”\n]{1,200}”/g, "[copy added later by the app]");
}
