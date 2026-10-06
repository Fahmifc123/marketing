/** Browser-side image helpers. */
import { REFERENCE_IMAGE } from "@/lib/image-settings";

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
