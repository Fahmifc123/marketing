"use client";

import { useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";

import { prepareReferenceImage, ReferenceImageError } from "@/lib/client-image";
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
          {processing ? "Preparing image…" : "Upload Reference"}
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
