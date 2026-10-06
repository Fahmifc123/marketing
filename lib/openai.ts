/**
 * Server-side OpenAI image client.
 *
 * - A new client is created per request with the user-supplied API key.
 * - The key is never stored, logged or returned.
 * - Raw OpenAI errors are mapped to clean, human-readable messages.
 */
import "server-only";

import OpenAI, { toFile } from "openai";

import {
  FALLBACK_QUALITY,
  formatSize,
  standardSizeFor,
} from "@/lib/image-settings";
import type { Dimensions, QualityId } from "@/types/image";

export type OutputFormat = "png" | "jpeg" | "webp";

/** Output format requested from the API. png gives the best quality for Canva. */
export const OUTPUT_FORMAT: OutputFormat = (() => {
  const value = process.env.IMAGE_OUTPUT_FORMAT;
  return value === "jpeg" || value === "webp" ? value : "png";
})();

const MIME_TYPES: Record<OutputFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** Generous timeout: high-quality generations can take minutes. */
const REQUEST_TIMEOUT_MS = 280_000;

export function createOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    maxRetries: 1,
    timeout: REQUEST_TIMEOUT_MS,
    // Never let the SDK log request details (which could include headers).
    logLevel: "off",
  });
}

export interface ReferenceImageInput {
  data: Uint8Array;
  name: string;
  type: string;
}

export interface ImageRequest {
  apiKey: string;
  model: string;
  prompt: string;
  quality: QualityId;
  size: Dimensions;
  reference?: ReferenceImageInput | null;
  signal?: AbortSignal;
}

export interface ImageResult {
  b64: string;
  mimeType: string;
  outputFormat: OutputFormat;
  quality: QualityId;
  size: string;
  notices: string[];
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

async function callImagesApi(client: OpenAI, req: ImageRequest, quality: QualityId, size: string) {
  const common = {
    model: req.model,
    prompt: req.prompt,
    quality,
    size,
    n: 1,
    output_format: OUTPUT_FORMAT,
  };

  if (req.reference) {
    const image = await toFile(req.reference.data, req.reference.name, { type: req.reference.type });
    return client.images.edit({ ...common, image }, { signal: req.signal });
  }
  return client.images.generate(common, { signal: req.signal });
}

function isParamError(err: unknown, param: string): boolean {
  if (!(err instanceof OpenAI.BadRequestError)) return false;
  if (err.param === param) return true;
  // Some API versions only mention the parameter in the message.
  return typeof err.message === "string" && new RegExp(`\\b${param}\\b`, "i").test(err.message) && /invalid|unsupported|not supported/i.test(err.message);
}

/**
 * Generates (or edits, when a reference is attached) one image.
 * Gracefully retries once with a supported quality and/or standard size if the
 * API rejects those parameters for the selected model.
 */
export async function generateImage(req: ImageRequest): Promise<ImageResult> {
  const client = createOpenAIClient(req.apiKey);
  const notices: string[] = [];
  let quality = req.quality;
  let size = formatSize(req.size);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await callImagesApi(client, req, quality, size);
      const b64 = response.data?.[0]?.b64_json;
      if (!b64) throw new EmptyImageError();
      const outputFormat = (response.output_format as OutputFormat | undefined) ?? OUTPUT_FORMAT;
      return {
        b64,
        mimeType: MIME_TYPES[outputFormat] ?? "image/png",
        outputFormat,
        quality,
        size: response.size ?? size,
        notices,
        usage: response.usage
          ? {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (err) {
      if (quality !== FALLBACK_QUALITY && isParamError(err, "quality")) {
        notices.push(`Kualitas "${quality}" tidak didukung model ini — otomatis memakai "${FALLBACK_QUALITY}".`);
        quality = FALLBACK_QUALITY;
        continue;
      }
      const standard = formatSize(standardSizeFor(req.size));
      if (size !== standard && isParamError(err, "size")) {
        notices.push(`Resolusi ${size} tidak didukung model ini — otomatis memakai ${standard}.`);
        size = standard;
        continue;
      }
      throw err;
    }
  }
  throw new EmptyImageError();
}

export class EmptyImageError extends Error {
  constructor() {
    super("OpenAI returned no image data");
  }
}

export interface UserFacingError {
  status: number;
  code: string;
  message: string;
}

/** Maps any error to a safe, human-readable message. Never includes keys, headers or stack traces. */
export function toUserFacingError(err: unknown): UserFacingError {
  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    return { status: 504, code: "timeout", message: "Generation terlalu lama dan dihentikan. Coba lagi atau pilih kualitas lebih rendah." };
  }
  if (err instanceof OpenAI.APIUserAbortError) {
    return { status: 499, code: "aborted", message: "Generation dibatalkan." };
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return { status: 502, code: "network_error", message: "Tidak dapat terhubung ke OpenAI. Periksa koneksi lalu coba lagi." };
  }
  if (err instanceof OpenAI.AuthenticationError) {
    return { status: 401, code: "invalid_api_key", message: "API key tidak valid. Periksa kembali API key kamu." };
  }
  if (err instanceof OpenAI.PermissionDeniedError) {
    // A 403 without an OpenAI error body comes from a network proxy/firewall, not OpenAI.
    if (!err.type && !err.code) {
      return { status: 502, code: "network_error", message: "Tidak dapat terhubung ke OpenAI. Periksa koneksi lalu coba lagi." };
    }
    return {
      status: 403,
      code: "permission_denied",
      message: "API key tidak memiliki akses ke model ini. Pastikan organisasi OpenAI kamu sudah terverifikasi untuk image generation.",
    };
  }
  if (err instanceof OpenAI.NotFoundError) {
    return { status: 400, code: "unsupported_model", message: "Model tidak tersedia untuk API key ini. Pilih model lain." };
  }
  if (err instanceof OpenAI.RateLimitError) {
    if (err.code === "insufficient_quota" || err.code === "billing_hard_limit_reached") {
      return { status: 402, code: "insufficient_quota", message: "Request gagal. Periksa billing API OpenAI." };
    }
    return { status: 429, code: "rate_limited", message: "Terlalu banyak request. Tunggu sebentar lalu coba lagi." };
  }
  if (err instanceof OpenAI.BadRequestError) {
    const code = err.code ?? "";
    if (code === "billing_hard_limit_reached" || code === "insufficient_quota") {
      return { status: 402, code: "insufficient_quota", message: "Request gagal. Periksa billing API OpenAI." };
    }
    if (code === "moderation_blocked" || code === "content_policy_violation" || /safety system|moderation/i.test(err.message)) {
      return {
        status: 400,
        code: "content_policy",
        message: "Prompt atau gambar referensi ditolak oleh sistem keamanan OpenAI. Ubah deskripsi lalu coba lagi.",
      };
    }
    if (code === "model_not_found" || err.param === "model") {
      return { status: 400, code: "unsupported_model", message: "Model tidak didukung. Pilih model lain." };
    }
    if (err.param === "size" || /\bsize\b/i.test(err.message)) {
      return { status: 400, code: "unsupported_size", message: "Ukuran gambar tidak didukung oleh model ini. Pilih format lain." };
    }
    if (err.param === "quality") {
      return { status: 400, code: "unsupported_quality", message: "Kualitas tidak didukung oleh model ini. Pilih kualitas lain." };
    }
    if (err.param?.startsWith("image") || /invalid image|image file|unsupported image|image format|mimetype/i.test(err.message)) {
      return { status: 400, code: "invalid_reference", message: "Format gambar tidak didukung." };
    }
    return { status: 400, code: "bad_request", message: "Request ditolak oleh OpenAI. Periksa pengaturan lalu coba lagi." };
  }
  if (err instanceof OpenAI.APIError) {
    if (err.status && err.status >= 500) {
      return { status: 502, code: "openai_unavailable", message: "Layanan OpenAI sedang bermasalah. Coba lagi beberapa saat lagi." };
    }
  }
  return { status: 500, code: "generation_failed", message: "Generation gagal. Coba lagi." };
}

/** Logs safe diagnostic fields only — never the API key, headers or prompt. */
export function logSafeError(context: string, err: unknown) {
  if (err instanceof OpenAI.APIError) {
    console.error(`[${context}] OpenAI error`, {
      status: err.status,
      code: err.code,
      type: err.type,
      param: err.param,
      requestId: err.requestID,
    });
    return;
  }
  console.error(`[${context}] ${err instanceof Error ? err.name : "Unknown error"}`);
}
