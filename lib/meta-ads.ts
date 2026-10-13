/**
 * Meta Ads carousel: placement sizes and the parser for prompts pasted from
 * ChatGPT. Shared by the server and the browser. Contains no internal prompt text.
 */
import type { Dimensions, FormatId } from "@/types/image";

export type MetaSizeId = "square" | "portrait" | "vertical";

export interface MetaAdSize {
  id: MetaSizeId;
  label: string;
  ratio: string;
  /** Existing format preset used for generation (highest practical resolution). */
  formatId: FormatId;
  /** Exact size delivered for upload to Meta Ads Manager. */
  exportSize: Dimensions;
  placement: string;
}

/** Ordered by generation priority: the first checked size is the "master" for the others. */
export const META_AD_SIZES: MetaAdSize[] = [
  {
    id: "portrait",
    label: "Portrait 4:5",
    ratio: "4:5",
    formatId: "instagram-portrait",
    exportSize: { width: 1080, height: 1350 },
    placement: "Feed Instagram & Facebook",
  },
  {
    id: "square",
    label: "Square 1:1",
    ratio: "1:1",
    formatId: "instagram-square",
    exportSize: { width: 1080, height: 1080 },
    placement: "Feed, carousel, right column",
  },
  {
    id: "vertical",
    label: "Vertical 9:16",
    ratio: "9:16",
    formatId: "instagram-story",
    exportSize: { width: 1080, height: 1920 },
    placement: "Stories & Reels",
  },
];

export const META_ADS_LIMITS = {
  /** Meta carousel ads allow up to 10 cards. */
  maxSlides: 10,
  maxSharedLength: 8000,
  maxSlideLength: 6000,
  minSlideLength: 3,
  concurrency: 3,
  /** Downsized reference images (style anchor / size master). */
  anchorMaxEdge: 1024,
} as const;

export function getMetaSize(id: string): MetaAdSize | undefined {
  return META_AD_SIZES.find((s) => s.id === id);
}

export interface ParsedPaste {
  /** Text before the first slide marker — applies to every slide (e.g. overall style). */
  shared: string;
  slides: string[];
}

/**
 * Matches slide headings ChatGPT typically produces, at the start of a line:
 * "Slide 1:", "**Slide 2 – Problem**", "### SLIDE 3", "Slide ke-4", "Card 5)", "Kartu 6".
 */
const MARKER =
  /^[ \t]*(?:#{1,6}[ \t]*)?(?:[*_]{1,3}[ \t]*)?(?:slide|card|kartu|carousel card|frame)[ \t]*(?:ke[-\s]?)?(\d{1,2})\b[ \t]*(?:[*_]{1,3})?[ \t]*(?:[:.)\-–—|]+[ \t]*)?/gim;

function clean(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*```/.test(line)) // drop code fences
    .join("\n")
    .replace(/^\s*[*_]{1,3}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Splits a pasted ChatGPT answer into a shared part and one prompt per slide. */
export function parsePastedPrompt(input: string): ParsedPaste {
  const text = input.replace(/\r\n?/g, "\n");
  const markers = [...text.matchAll(MARKER)];
  if (markers.length === 0) {
    const single = clean(text);
    return { shared: "", slides: single ? [single] : [] };
  }

  const shared = clean(text.slice(0, markers[0].index));
  const slides = markers
    .map((m, i) => {
      const start = (m.index ?? 0) + m[0].length;
      const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
      return clean(text.slice(start, end));
    })
    .filter((s) => s.length > 0);
  return { shared, slides };
}
