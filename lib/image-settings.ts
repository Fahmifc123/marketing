/**
 * Image generation settings.
 *
 * Model names, quality values and sizes change over time. Keep every value the
 * OpenAI API receives in this file so they can be updated without touching
 * API or UI logic.
 */
import type {
  CustomRatio,
  Dimensions,
  FormatId,
  FormatPreset,
  ImageModelOption,
  QualityId,
  QualityOption,
  ResolvedFormat,
} from "@/types/image";

export const IMAGE_MODELS: ImageModelOption[] = [
  {
    id: "gpt-image-2.5-sunburst",
    label: "GPT-Image 2.5 Sunburst",
    description: "Primary model. Best overall quality.",
  },
  {
    id: "gpt-image-2.5-flare",
    label: "GPT-Image 2.5 Flare",
    description: "Secondary model.",
  },
];

export const DEFAULT_MODEL = IMAGE_MODELS[0].id;

export const QUALITY_OPTIONS: QualityOption[] = [
  { id: "high", label: "High", description: "Fast, production-ready quality." },
  { id: "xhigh", label: "Extra High", description: "More detail, slower." },
  { id: "max", label: "Max", description: "Highest detail, slowest." },
];

export const DEFAULT_QUALITY: QualityId = "high";

/** Quality used when the API rejects the selected quality. */
export const FALLBACK_QUALITY: QualityId = "high";

/**
 * Size rules for the GPT-Image 2.x models (OpenAI SDK docs):
 * - width and height divisible by 16
 * - aspect ratio between 1:3 and 3:1
 * - above 2560x1440 is experimental → stay at or below that pixel budget
 */
export const SIZE_RULES = {
  multiple: 16,
  minRatio: 1 / 3,
  maxRatio: 3,
  maxEdge: 2560,
  targetPixels: 2560 * 1440,
} as const;

/** Standard sizes every GPT image model accepts. Used as a fallback. */
export const STANDARD_SIZES = {
  square: { width: 1024, height: 1024 },
  portrait: { width: 1024, height: 1536 },
  landscape: { width: 1536, height: 1024 },
} as const satisfies Record<string, Dimensions>;

export const FORMAT_PRESETS: FormatPreset[] = [
  {
    id: "instagram-portrait",
    label: "Instagram Portrait",
    ratio: "4:5",
    generationSize: { width: 1600, height: 2000 },
    exportSize: { width: 1080, height: 1350 },
    usage: "Instagram feed post",
  },
  {
    id: "instagram-square",
    label: "Instagram Square",
    ratio: "1:1",
    generationSize: { width: 1920, height: 1920 },
    exportSize: { width: 1080, height: 1080 },
    usage: "Instagram / LinkedIn feed post",
  },
  {
    id: "instagram-story",
    label: "Instagram Story",
    ratio: "9:16",
    generationSize: { width: 1440, height: 2560 },
    exportSize: { width: 1080, height: 1920 },
    usage: "Instagram Story / Reels cover",
  },
  {
    id: "landscape",
    label: "Landscape",
    ratio: "16:9",
    generationSize: { width: 2560, height: 1440 },
    exportSize: { width: 1920, height: 1080 },
    usage: "Banner, web, YouTube thumbnail",
  },
  {
    id: "presentation",
    label: "Presentation",
    ratio: "16:9",
    generationSize: { width: 2560, height: 1440 },
    exportSize: { width: 1920, height: 1080 },
    usage: "Slide deck visual",
  },
  {
    id: "custom",
    label: "Custom",
    ratio: "custom",
    generationSize: { width: 1920, height: 1920 },
    exportSize: null,
    usage: "Any ratio between 1:3 and 3:1",
  },
];

export const DEFAULT_FORMAT: FormatId = "instagram-portrait";
export const STORY_FORMAT: FormatId = "instagram-story";
export const DEFAULT_CUSTOM_RATIO: CustomRatio = { width: 3, height: 4 };

export function getModel(id: string): ImageModelOption | undefined {
  return IMAGE_MODELS.find((m) => m.id === id);
}

export function isQualityId(value: unknown): value is QualityId {
  return QUALITY_OPTIONS.some((q) => q.id === value);
}

export function getFormatPreset(id: string): FormatPreset | undefined {
  return FORMAT_PRESETS.find((f) => f.id === id);
}

export function isValidCustomRatio(ratio: unknown): ratio is CustomRatio {
  if (!ratio || typeof ratio !== "object") return false;
  const { width, height } = ratio as Record<string, unknown>;
  if (typeof width !== "number" || typeof height !== "number") return false;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (width <= 0 || height <= 0 || width > 100 || height > 100) return false;
  const r = width / height;
  return r >= SIZE_RULES.minRatio && r <= SIZE_RULES.maxRatio;
}

function floorTo(value: number, multiple: number) {
  return Math.max(multiple, Math.floor(value / multiple) * multiple);
}

/**
 * Computes the largest valid generation size for an arbitrary ratio within the
 * non-experimental pixel budget.
 */
export function sizeForRatio(ratio: CustomRatio): Dimensions {
  const { multiple, maxEdge, targetPixels, minRatio, maxRatio } = SIZE_RULES;
  const r = Math.min(maxRatio, Math.max(minRatio, ratio.width / ratio.height));

  let width = Math.sqrt(targetPixels * r);
  let height = width / r;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  width *= scale;
  height *= scale;

  let w = floorTo(width, multiple);
  let h = floorTo(height, multiple);

  // Rounding can push the ratio just outside the allowed range.
  while (w / h > maxRatio) w -= multiple;
  while (w / h < minRatio) h -= multiple;
  return { width: w, height: h };
}

export function formatSize(size: Dimensions): string {
  return `${size.width}x${size.height}`;
}

function simplifyRatio({ width, height }: CustomRatio): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  if (Number.isInteger(width) && Number.isInteger(height)) {
    const d = gcd(width, height);
    return `${width / d}:${height / d}`;
  }
  return `${width}:${height}`;
}

/** Resolves the format the request will actually use. */
export function resolveFormat(options: {
  formatId: FormatId;
  customRatio?: CustomRatio;
  autoStory?: boolean;
}): ResolvedFormat {
  const id = options.autoStory ? STORY_FORMAT : options.formatId;
  const preset = getFormatPreset(id) ?? getFormatPreset(DEFAULT_FORMAT)!;

  if (preset.id === "custom") {
    const ratio = options.customRatio ?? DEFAULT_CUSTOM_RATIO;
    return {
      id: "custom",
      label: preset.label,
      ratio: simplifyRatio(ratio),
      generationSize: sizeForRatio(ratio),
      exportSize: null,
      autoSelected: false,
    };
  }

  return {
    id: preset.id,
    label: preset.label,
    ratio: preset.ratio,
    generationSize: preset.generationSize,
    exportSize: preset.exportSize,
    autoSelected: Boolean(options.autoStory) && options.formatId !== STORY_FORMAT,
  };
}

/** Nearest standard size, used when the API rejects a custom resolution. */
export function standardSizeFor(size: Dimensions): Dimensions {
  const r = size.width / size.height;
  if (r > 1.15) return STANDARD_SIZES.landscape;
  if (r < 0.87) return STANDARD_SIZES.portrait;
  return STANDARD_SIZES.square;
}

/** Reference image constraints (client compresses before upload). */
export const REFERENCE_IMAGE = {
  acceptedTypes: ["image/png", "image/jpeg", "image/webp"],
  /** Hard server limit. Keep below common serverless request limits. */
  maxBytes: 4 * 1024 * 1024,
  /** The browser re-encodes larger images down to this edge length. */
  maxEdge: 2048,
} as const;

export const PROMPT_LIMITS = {
  minLength: 3,
  maxLength: 4000,
  /** Developer Mode manual override. GPT image models accept up to 32,000 chars. */
  maxOverrideLength: 32000,
} as const;
