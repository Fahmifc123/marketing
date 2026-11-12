"use client";

import { upload } from "@vercel/blob/client";
import { useId, useRef, useState } from "react";

import {
  ALLOWED_UPLOAD_TYPES,
  ASSET_LIMITS,
  EMAIL_TEMPLATES,
  assetKindFor,
  formatBytes,
  type EmailAsset,
  type EmailTemplateId,
} from "@/lib/email-assets";

/** Downsizes big images to email-friendly width; keeps PNG (transparency) or uses JPEG. */
async function prepareImage(file: File): Promise<File> {
  if (file.type === "image/gif") return file; // keep animation
  const bitmap = await createImageBitmap(file);
  const tooWide = bitmap.width > ASSET_LIMITS.imageMaxWidth;
  if (!tooWide && file.size <= 1.5 * 1024 * 1024) {
    bitmap.close();
    return file;
  }
  const scale = Math.min(1, ASSET_LIMITS.imageMaxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.86));
  if (!blob || blob.size >= file.size) return file;
  const ext = type === "image/png" ? "png" : "jpg";
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + `.${ext}`, { type });
}

const safeName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-80) || "file";

export function TemplatePicker({
  value,
  onChange,
  disabled,
}: {
  value: EmailTemplateId;
  onChange: (t: EmailTemplateId) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset>
      <legend className="label">Template</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {EMAIL_TEMPLATES.map((t) => (
          <label
            key={t.id}
            title={t.description}
            className={`cursor-pointer rounded-lg border px-3 py-2 text-xs transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-orange ${
              value === t.id ? "border-navy bg-pale/70 text-navy" : "border-line bg-white text-muted hover:border-navy-400 hover:text-navy"
            }`}
          >
            <input
              type="radio"
              name="email-template"
              value={t.id}
              checked={value === t.id}
              onChange={() => onChange(t.id)}
              disabled={disabled}
              className="sr-only"
            />
            <span className="block font-semibold">{t.label}</span>
            <span className="mt-0.5 block leading-snug opacity-80">{t.description}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Upload images (shown in the email) and files (download links) to Vercel Blob. */
export default function EmailAssetsPanel({
  assets,
  onChange,
  template,
  disabled,
}: {
  assets: EmailAsset[];
  onChange: (assets: EmailAsset[]) => void;
  template: EmailTemplateId;
  disabled?: boolean;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    let next = [...assets];
    for (const original of Array.from(list)) {
      if (next.length >= ASSET_LIMITS.maxAssets) {
        setError(`Maksimal ${ASSET_LIMITS.maxAssets} file per email.`);
        break;
      }
      const kind = assetKindFor(original.type);
      if (!kind) {
        setError(`${original.name}: jenis file tidak didukung. Gambar: JPG/PNG/GIF. File: PDF, Word, Excel, PowerPoint, ZIP.`);
        continue;
      }
      try {
        setUploading(original.name);
        const file = kind === "image" ? await prepareImage(original) : original;
        const limit = kind === "image" ? ASSET_LIMITS.maxImageBytes : ASSET_LIMITS.maxFileBytes;
        if (file.size > limit) {
          setError(`${original.name}: terlalu besar (maks ${formatBytes(limit)}).`);
          continue;
        }
        const blob = await upload(`email/${safeName(file.name)}`, file, {
          access: "public",
          handleUploadUrl: "/api/email/upload",
          contentType: file.type,
        });
        next = [
          ...next,
          {
            url: blob.url,
            name: original.name.slice(0, ASSET_LIMITS.maxNameLength),
            kind,
            contentType: file.type,
            size: file.size,
            alt: kind === "image" ? original.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, ASSET_LIMITS.maxAltLength) : "",
          },
        ];
        onChange(next);
      } catch {
        setError(`${original.name}: upload gagal. Coba lagi.`);
      } finally {
        setUploading(null);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= assets.length) return;
    const next = [...assets];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  const firstImage = assets.findIndex((a) => a.kind === "image");

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="label">Gambar &amp; file</p>
        <span className="text-[11px] text-muted">
          {assets.length}/{ASSET_LIMITS.maxAssets}
        </span>
      </div>
      <label
        htmlFor={`${id}-file`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!disabled) void handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-navy-300 bg-white px-4 py-4 text-center text-sm font-semibold text-navy hover:border-navy hover:bg-canvas has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-orange ${
          disabled || uploading ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <span>
          <span aria-hidden="true" className="mr-1 text-orange">
            +
          </span>
          {uploading ? `Mengupload ${uploading}…` : "Upload gambar / PDF / file"}
        </span>
        <span className="text-[11px] font-normal text-muted">
          Gambar tampil di email (JPG/PNG/GIF, maks 5 MB). PDF & file lain jadi tombol &ldquo;Unduh&rdquo; (maks 15 MB).
        </span>
        <input
          ref={inputRef}
          id={`${id}-file`}
          type="file"
          multiple
          accept={ALLOWED_UPLOAD_TYPES.join(",")}
          onChange={(e) => void handleFiles(e.target.files)}
          disabled={disabled || Boolean(uploading)}
          className="sr-only"
        />
      </label>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
      {assets.length > 0 && (
        <ul className="mt-3 space-y-2">
          {assets.map((a, i) => (
            <li key={a.url} className="flex items-center gap-3 rounded-lg border border-line bg-white p-2">
              {a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded asset thumbnail
                <img src={a.url} alt="" className="h-12 w-12 shrink-0 rounded-md border border-line object-cover" />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-pale text-[10px] font-bold text-navy uppercase">
                  {a.name.split(".").pop()?.slice(0, 4) ?? "file"}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-navy" title={a.name}>
                  {a.name}
                  {template === "banner" && i === firstImage && (
                    <span className="ml-1.5 rounded bg-navy px-1.5 py-0.5 text-[9px] text-white">BANNER</span>
                  )}
                </p>
                {a.kind === "image" ? (
                  <input
                    value={a.alt}
                    onChange={(e) => onChange(assets.map((x, j) => (j === i ? { ...x, alt: e.target.value.slice(0, ASSET_LIMITS.maxAltLength) } : x)))}
                    placeholder="Deskripsi gambar (alt text)"
                    aria-label={`Alt text ${a.name}`}
                    className="field mt-1 py-1 text-xs"
                  />
                ) : (
                  <p className="text-[11px] text-muted">{formatBytes(a.size)} · tombol unduh</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5 text-[11px] font-semibold">
                <span className="flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Naikkan ${a.name}`} className="px-1 text-navy-600 disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === assets.length - 1} aria-label={`Turunkan ${a.name}`} className="px-1 text-navy-600 disabled:opacity-30">
                    ↓
                  </button>
                </span>
                <button type="button" onClick={() => onChange(assets.filter((_, j) => j !== i))} className="text-muted hover:text-danger">
                  Hapus
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
