export type QualityId = "high" | "xhigh" | "max";

export type FormatId =
  | "instagram-portrait"
  | "instagram-square"
  | "instagram-story"
  | "landscape"
  | "presentation"
  | "custom";

export interface ImageModelOption {
  /** Exact model id sent to the OpenAI API. */
  id: string;
  /** Human-readable label shown in the UI. */
  label: string;
  description: string;
}

export interface QualityOption {
  id: QualityId;
  label: string;
  description: string;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface FormatPreset {
  id: FormatId;
  label: string;
  /** Aspect ratio label, e.g. "4:5". */
  ratio: string;
  /** Size requested from the image model (highest practical resolution). */
  generationSize: Dimensions;
  /** Final design target for export / Canva. */
  exportSize: Dimensions | null;
  usage: string;
}

export interface CustomRatio {
  width: number;
  height: number;
}

/** Resolved format after applying custom ratios and auto-detection. */
export interface ResolvedFormat {
  id: FormatId;
  label: string;
  ratio: string;
  generationSize: Dimensions;
  exportSize: Dimensions | null;
  /** True when the format was switched automatically (e.g. story prompts → 9:16). */
  autoSelected: boolean;
}

/** A generation stored in local (IndexedDB) history. Never contains API keys or access codes. */
export interface HistoryItem {
  id: string;
  createdAt: number;
  prompt: string;
  model: string;
  modelLabel: string;
  quality: QualityId;
  formatId: FormatId;
  formatLabel: string;
  aspectRatio: string;
  size: string;
  customRatio?: CustomRatio;
  mimeType: string;
  image: Blob;
  thumbnail: string;
}
