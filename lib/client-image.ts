/** Browser-side image helpers. */
import { REFERENCE_IMAGE } from "@/lib/image-settings";
import { logoZone, type LogoCorner } from "@/lib/logo-placement";
import { drawCardText, type TextOverlay } from "@/lib/text-render";

export function base64ToBlob(b64: string, mimeType: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function drawScaled(source: Blob, maxEdge: number) {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const original = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return { canvas, original, scaled: scale < 1 };
}

/** Small preview stored with history items. */
export async function createThumbnail(blob: Blob, maxEdge = 360): Promise<string> {
  const { canvas } = await drawScaled(blob, maxEdge);
  return canvas.toDataURL("image/webp", 0.82);
}

export class ReferenceImageError extends Error {}

/**
 * Validates a reference image and, if needed, downsizes / re-encodes it so the
 * upload stays within the server limit. WEBP keeps transparency (e.g. logos).
 */
export async function prepareReferenceImage(file: File): Promise<File> {
  if (!(REFERENCE_IMAGE.acceptedTypes as readonly string[]).includes(file.type)) {
    throw new ReferenceImageError("Format gambar tidak didukung. Gunakan PNG, JPG, atau WEBP.");
  }

  let drawn;
  try {
    drawn = await drawScaled(file, REFERENCE_IMAGE.maxEdge);
  } catch {
    throw new ReferenceImageError("Gambar tidak dapat dibaca. Coba file lain.");
  }

  const comfortableSize = REFERENCE_IMAGE.maxBytes * 0.85;
  if (!drawn.scaled && file.size <= comfortableSize) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "") || "reference";
  for (const [type, quality, ext] of [
    ["image/webp", 0.92, "webp"],
    ["image/webp", 0.8, "webp"],
    ["image/jpeg", 0.85, "jpg"],
  ] as const) {
    const blob = await canvasToBlob(drawn.canvas, type, quality);
    if (blob && blob.type === type && blob.size <= comfortableSize) {
      return new File([blob], `${baseName}.${ext}`, { type });
    }
  }
  throw new ReferenceImageError("Gambar referensi terlalu besar. Gunakan gambar yang lebih kecil.");
}

/** Downsizes an approved cover so it can travel as a small style reference with every slide request. */
export async function prepareStyleAnchor(blob: Blob, maxEdge: number): Promise<File> {
  const { canvas } = await drawScaled(blob, maxEdge);
  for (const [type, quality, ext] of [
    ["image/webp", 0.85, "webp"],
    ["image/jpeg", 0.85, "jpg"],
  ] as const) {
    const out = await canvasToBlob(canvas, type, quality);
    if (out && out.type === type) return new File([out], `style-anchor.${ext}`, { type });
  }
  throw new Error("Could not encode style anchor");
}

/**
 * Resizes a generated image to an exact delivery size (e.g. 1080x1350 for Meta).
 * The generation size has the same aspect ratio, so this is a clean downscale;
 * any rounding difference is center-cropped.
 */
export async function exportExactSize(blob: Blob, width: number, height: number): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.max(width / bitmap.width, height / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (width - w) / 2, (height - h) / 2, w, h);
  bitmap.close();
  const out = await canvasToBlob(canvas, "image/png");
  if (!out) throw new Error("Could not encode image");
  return out;
}

export interface ActiveLogo {
  corner: LogoCorner;
  /** Logo for light backgrounds (required). */
  primary: Blob;
  /** Optional light/white version for dark backgrounds. */
  onDark: Blob | null;
}

/** Average perceived luminance (0–255) of a canvas region. */
function regionLuminance(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): number {
  const { data } = ctx.getImageData(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 16) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    n++;
  }
  return n ? sum / n : 255;
}

/**
 * Draws the official logo file into the reserved corner zone — the logo pixels
 * are never altered, only scaled to fit. On a dark background the light
 * version is used when one is saved.
 */
async function drawLogo(ctx: CanvasRenderingContext2D, width: number, height: number, logo: ActiveLogo) {
  const zone = logoZone(logo.corner, width, height);
  const zx = zone.x * width;
  const zy = zone.y * height;
  const zw = zone.width * width;
  const zh = zone.height * height;

  const dark = regionLuminance(ctx, zx, zy, zw, zh) < 110;
  const mark = await createImageBitmap(dark && logo.onDark ? logo.onDark : logo.primary);
  const scale = Math.min(zw / mark.width, zh / mark.height);
  const w = mark.width * scale;
  const h = mark.height * scale;
  // Align to the corner's edges so the logo hugs the margin.
  const x = logo.corner.endsWith("left") ? zx : zx + zw - w;
  const y = logo.corner.startsWith("top") ? zy : zy + zh - h;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(mark, x, y, w, h);
  mark.close();
}

/**
 * Builds the final creative from the raw model output: app-rendered copy
 * first, then the official logo on top.
 */
export async function composeCreative(
  image: Blob,
  options: {
    logo?: ActiveLogo | null;
    text?: TextOverlay | null;
    /**
     * Final delivery size. The image is cover-cropped to it first, so copy and
     * logo are laid out on the exact final frame and can never be cropped off
     * (even if the API returned a fallback size with another ratio).
     */
    size?: { width: number; height: number };
  },
): Promise<Blob> {
  const base = await createImageBitmap(image);
  const width = options.size?.width ?? base.width;
  const height = options.size?.height ?? base.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  const scale = Math.max(width / base.width, height / base.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(base, (width - base.width * scale) / 2, (height - base.height * scale) / 2, base.width * scale, base.height * scale);
  base.close();

  if (options.text) await drawCardText(ctx, canvas.width, canvas.height, options.text, options.logo?.corner ?? null);
  if (options.logo) await drawLogo(ctx, canvas.width, canvas.height, options.logo);

  const out = await canvasToBlob(canvas, "image/png");
  if (!out) throw new Error("Could not encode image");
  return out;
}

export function compositeLogo(image: Blob, logo: ActiveLogo): Promise<Blob> {
  return composeCreative(image, { logo });
}

/** Applies app-rendered copy and/or the official logo; never fails the generation. */
export async function finalizeImage(
  raw: Blob,
  logo: ActiveLogo | null,
  text: TextOverlay | null = null,
  size?: { width: number; height: number },
): Promise<{ blob: Blob; logoApplied: boolean }> {
  if (!logo && !text && !size) return { blob: raw, logoApplied: false };
  try {
    return { blob: await composeCreative(raw, { logo, text, size }), logoApplied: Boolean(logo) };
  } catch {
    return { blob: raw, logoApplied: false };
  }
}

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export function fileTimestamp(date = new Date()): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`
  );
}

export function extensionFor(mimeType: string): string {
  return EXTENSIONS[mimeType] ?? "png";
}

export function downloadFilename(mimeType: string, date = new Date()): string {
  return `intelligo-marketing-${fileTimestamp(date)}.${extensionFor(mimeType)}`;
}

/** Downloads a blob with a unique, timestamped filename (never overwrites earlier files). */
export function downloadBlob(blob: Blob, filename = downloadFilename(blob.type)) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
