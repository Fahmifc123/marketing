"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";

import { fetchImageFromUrl, imageFromClipboard, prepareReferenceImage, ReferenceImageError } from "@/lib/client-image";
import { REFERENCE_IMAGE } from "@/lib/image-settings";

export interface ReferenceImage {
  file: File;
  /** Original filename shown to the user. */
  name: string;
  previewUrl: string;
}

interface Props {
  value: ReferenceImage | null;
  onChange: (value: ReferenceImage | null) => void;
  disabled?: boolean;
}

export default function ReferenceUploader({ value, onChange, disabled }: Props) {
  const inputId = useId();
  const helpId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [link, setLink] = useState("");

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setProcessing(true);
    try {
      const prepared = await prepareReferenceImage(file);
      if (value) URL.revokeObjectURL(value.previewUrl);
      onChange({ file: prepared, name: file.name, previewUrl: URL.createObjectURL(prepared) });
    } catch (err) {
      setError(err instanceof ReferenceImageError ? err.message : "Format gambar tidak didukung.");
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // Paste a copied image anywhere on the page (Ctrl/Cmd+V). Text pastes are left alone.
  useEffect(() => {
    if (disabled) return;
    function onPaste(e: ClipboardEvent) {
      if ((e.target as Element | null)?.closest?.("[data-own-paste]")) return;
      const file = imageFromClipboard(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      void handleFile(file);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  async function fromLink() {
    const url = link.trim();
    if (!url) return;
    setError(null);
    setProcessing(true);
    try {
      const file = await fetchImageFromUrl(url);
      setLink("");
      setProcessing(false);
      await handleFile(file);
    } catch (err) {
      setError(err instanceof ReferenceImageError ? err.message : "Gambar tidak bisa diambil dari link itu.");
      setProcessing(false);
    }
  }

  function remove() {
    if (value) URL.revokeObjectURL(value.previewUrl);
    onChange(null);
    setError(null);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    if (!disabled) void handleFile(e.dataTransfer.files?.[0]);
  }

  return (
    <div>
      <span className="label" id={`${inputId}-label`}>
        Reference Image <span className="font-normal tracking-normal text-muted normal-case">(optional)</span>
      </span>

      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
          <img
            src={value.previewUrl}
            alt="Reference image preview"
            className="h-14 w-14 shrink-0 rounded-md border border-line bg-white object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-navy" title={value.name}>
              {value.name}
            </p>
            <p className="text-xs text-muted">{(value.file.size / 1024 / 1024).toFixed(1)} MB</p>
          </div>
          <button type="button" onClick={remove} disabled={disabled} className="btn-ghost text-xs">
            Remove
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-4 text-sm font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-orange ${
            dragging ? "border-navy bg-pale text-navy" : "border-navy-300 bg-white text-navy hover:border-navy hover:bg-canvas"
          } ${disabled ? "pointer-events-none opacity-50" : ""}`}
        >
          <span aria-hidden="true" className="text-lg leading-none text-orange">
            +
          </span>
          {processing ? "Preparing image…" : "Upload / paste (Ctrl+V) reference"}
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={REFERENCE_IMAGE.acceptedTypes.join(",")}
            onChange={(e: ChangeEvent<HTMLInputElement>) => void handleFile(e.target.files?.[0])}
            disabled={disabled || processing}
            aria-labelledby={`${inputId}-label`}
            aria-describedby={helpId}
            className="sr-only"
          />
        </label>
      )}

      {!value && (
        <div className="mt-2 flex gap-2">
          <input
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void fromLink();
              }
            }}
            placeholder="…atau tempel link gambar https://"
            aria-label="Link gambar referensi"
            disabled={disabled || processing}
            className="field min-w-0 flex-1 py-2 text-sm"
          />
          <button type="button" onClick={() => void fromLink()} disabled={disabled || processing || !link.trim()} className="btn-secondary px-4 text-sm">
            Ambil
          </button>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : (
        <p id={helpId} className="mt-1.5 text-xs leading-relaxed text-muted">
          Layout, orang, logo resmi, atau inspirasi visual. PNG, JPG, WEBP. Jelaskan cara pakainya di prompt — mis.
          &ldquo;gunakan layout ini&rdquo;.
        </p>
      )}
    </div>
  );
}
