/**
 * Email assets (images, PDFs and other files) and email templates.
 *
 * Resend broadcasts cannot carry attachments, and images in an email body need
 * a public URL — so every file is uploaded to the project's public Vercel Blob
 * store and placed in the email: images inline, other files as download links.
 * The same email is used for test sends and broadcasts.
 */

export type AssetKind = "image" | "file";

export interface EmailAsset {
  url: string;
  name: string;
  kind: AssetKind;
  contentType: string;
  size: number;
  /** Alt text for images (accessibility + shown when images are blocked). */
  alt: string;
}

export const ASSET_LIMITS = {
  maxAssets: 10,
  maxImageBytes: 5 * 1024 * 1024,
  maxFileBytes: 15 * 1024 * 1024,
  /** Images wider than this are downsized in the browser before upload. */
  imageMaxWidth: 1200,
  maxNameLength: 120,
  maxAltLength: 200,
} as const;

/** JPEG/PNG/GIF render in every major email client (WEBP does not in Outlook). */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif"] as const;

export const FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
] as const;

export const ALLOWED_UPLOAD_TYPES: string[] = [...IMAGE_TYPES, ...FILE_TYPES];

export function assetKindFor(contentType: string): AssetKind | null {
  if ((IMAGE_TYPES as readonly string[]).includes(contentType)) return "image";
  if ((FILE_TYPES as readonly string[]).includes(contentType)) return "file";
  return null;
}

/** Only files from Vercel Blob public stores may appear in emails. */
export function isAllowedAssetUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export class AssetValidationError extends Error {}

/** Validates untrusted asset lists from the browser. */
export function parseEmailAssets(input: unknown): EmailAsset[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new AssetValidationError("Daftar file tidak valid.");
  if (input.length > ASSET_LIMITS.maxAssets) throw new AssetValidationError(`Maksimal ${ASSET_LIMITS.maxAssets} file per email.`);
  return input.map((raw, i) => {
    const a = (raw ?? {}) as Record<string, unknown>;
    const url = typeof a.url === "string" ? a.url.trim() : "";
    if (!isAllowedAssetUrl(url)) throw new AssetValidationError(`File ${i + 1}: URL tidak diizinkan.`);
    const contentType = typeof a.contentType === "string" ? a.contentType : "";
    const kind = assetKindFor(contentType);
    if (!kind) throw new AssetValidationError(`File ${i + 1}: jenis file tidak didukung.`);
    const name = (typeof a.name === "string" ? a.name : "file").trim().slice(0, ASSET_LIMITS.maxNameLength) || "file";
    const alt = (typeof a.alt === "string" ? a.alt : "").trim().slice(0, ASSET_LIMITS.maxAltLength);
    const size = Number(a.size);
    return { url, name, kind, contentType, size: Number.isFinite(size) && size > 0 ? size : 0, alt };
  });
}

export const EMAIL_TEMPLATES = [
  { id: "classic", label: "Klasik", description: "Header navy, kartu putih. Serbaguna." },
  { id: "minimal", label: "Minimal", description: "Seperti surat pribadi. Paling aman dari folder spam." },
  { id: "banner", label: "Banner", description: "Gambar pertama jadi banner besar di atas." },
  { id: "newsletter", label: "Newsletter", description: "Tiap paragraf jadi section terpisah." },
  { id: "promo", label: "Promo", description: "Blok judul navy + tombol CTA oranye besar." },
] as const;

export type EmailTemplateId = (typeof EMAIL_TEMPLATES)[number]["id"];

export function isEmailTemplateId(value: unknown): value is EmailTemplateId {
  return EMAIL_TEMPLATES.some((t) => t.id === value);
}

/** Visual design of an email: template + uploaded assets. */
export interface EmailDesign {
  template: EmailTemplateId;
  assets: EmailAsset[];
}

export const DEFAULT_DESIGN: EmailDesign = { template: "classic", assets: [] };

export function parseEmailDesign(template: unknown, assets: unknown): EmailDesign {
  return { template: isEmailTemplateId(template) ? template : "classic", assets: parseEmailAssets(assets) };
}
