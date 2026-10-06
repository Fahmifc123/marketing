import type { SlideRole } from "./carousel";
import type { CustomRatio, FormatId, QualityId, ResolvedFormat } from "./image";

export type ContentType =
  | "poster"
  | "carousel"
  | "story"
  | "educational"
  | "recruitment"
  | "event"
  | "campaign"
  | "social"
  | "general";

export type FunnelStage = "cold" | "warm" | "retargeting";

/** Optional campaign context — reserved for the future Campaign Generator module. */
export interface CampaignContext {
  objective?: string;
  audience?: string;
  funnelStage?: FunnelStage;
  offer?: string;
}

/** Settings the user picks in the UI. */
export interface GenerationSettings {
  model: string;
  quality: QualityId;
  formatId: FormatId;
  customRatio: CustomRatio;
  /** True once the user has explicitly chosen a format. */
  formatExplicit: boolean;
}

/** Safe metadata returned to the browser. Never contains the API key or access code. */
export interface GenerationMeta {
  model: string;
  modelLabel: string;
  quality: QualityId;
  requestedQuality: QualityId;
  format: ResolvedFormat;
  size: string;
  outputFormat: string;
  hasReference: boolean;
  referenceName: string | null;
  promptOverride: boolean;
  contentTypes: ContentType[];
  durationMs: number;
  createdAt: number;
  notices: string[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  carouselSlide?: {
    index: number;
    total: number;
    role: SlideRole;
    styleAnchor: boolean;
  };
}

export interface GenerateSuccessResponse {
  ok: true;
  image: {
    b64: string;
    mimeType: string;
  };
  meta: GenerationMeta;
  /** Only returned when Developer Mode is enabled. */
  internalPrompt?: string;
}

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type GenerateResponse = GenerateSuccessResponse | ApiErrorResponse;

export interface PromptPreviewRequest {
  prompt: string;
  model: string;
  quality: QualityId;
  formatId: FormatId;
  customRatio?: CustomRatio;
  formatExplicit?: boolean;
  hasReference?: boolean;
}

export interface PromptPreviewResponse {
  ok: true;
  prompt: string;
  format: ResolvedFormat;
  contentTypes: ContentType[];
}

/** A creative shown in the preview panel (fresh generation or opened from history). */
export interface CreativeResult {
  id: string;
  url: string;
  blob: Blob;
  mimeType: string;
  prompt: string;
  settings: GenerationSettings;
  modelLabel: string;
  quality: QualityId;
  formatLabel: string;
  aspectRatio: string;
  size: string;
  createdAt: number;
  meta?: GenerationMeta;
  internalPrompt?: string;
  fromHistory?: boolean;
}
