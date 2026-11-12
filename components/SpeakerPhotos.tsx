"use client";

import { useId, useRef, useState } from "react";

import { fetchImageFromUrl, imageFromClipboard, prepareSpeakerPhoto, ReferenceImageError } from "@/lib/client-image";
import { REFERENCE_IMAGE } from "@/lib/image-settings";
import { SPEAKER_LIMITS } from "@/lib/speakers";

export interface Speaker {
  file: File;
  previewUrl: string;
  name: string;
  title: string;
}

interface Props {
  value: Speaker[];
  onChange: (value: Speaker[]) => void;
  disabled?: boolean;
}

/** Speaker photos for class / program creatives: upload, paste or link. They are pasted in, not redrawn. */
export default function SpeakerPhotos({ value, onChange, disabled }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const full = value.length >= SPEAKER_LIMITS.max;

  async function add(files: File[]) {
    setError(null);
    setBusy(true);
    let next = [...value];
    try {
      for (const f of files) {
        if (next.length >= SPEAKER_LIMITS.max) {
          setError(`Maksimal ${SPEAKER_LIMITS.max} pembicara.`);
          break;
        }
        const file = await prepareSpeakerPhoto(f);
        next = [...next, { file, previewUrl: URL.createObjectURL(file), name: "", title: "" }];
      }
      onChange(next);
    } catch (err) {
      onChange(next);
      setError(err instanceof ReferenceImageError ? err.message : "Foto tidak dapat dibaca.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function fromLink() {
    if (!link.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const file = await fetchImageFromUrl(link.trim());
      setLink("");
      setBusy(false);
      await add([file]);
    } catch (err) {
      setBusy(false);
      setError(err instanceof ReferenceImageError ? err.message : "Gambar tidak bisa diambil dari link itu.");
    }
  }

  function edit(i: number, patch: Partial<Speaker>) {
    onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  function remove(i: number) {
    URL.revokeObjectURL(value[i].previewUrl);
    onChange(value.filter((_, j) => j !== i));
  }

  return (
    <div
      data-own-paste
      onPaste={(e) => {
        const file = imageFromClipboard(e.clipboardData);
        if (!file || disabled || full) return;
        e.preventDefault();
        void add([file]);
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="label">Foto pembicara</span>
        <span className="text-[11px] text-muted">
          {value.length}/{SPEAKER_LIMITS.max}
        </span>
      </div>

      {value.length > 0 && (
        <ul className="mb-2 space-y-2">
          {value.map((s, i) => (
            <li key={s.previewUrl} className="flex items-start gap-3 rounded-lg border border-line bg-canvas p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
              <img src={s.previewUrl} alt="" className="h-16 w-16 shrink-0 rounded-md border border-line bg-white object-cover" />
              <div className="grid min-w-0 flex-1 gap-1.5">
                <input
                  value={s.name}
                  onChange={(e) => edit(i, { name: e.target.value.slice(0, SPEAKER_LIMITS.name) })}
                  placeholder="Nama pembicara (opsional)"
                  aria-label={`Nama pembicara ${i + 1}`}
                  disabled={disabled}
                  className="field py-1.5 text-sm"
                />
                <input
                  value={s.title}
                  onChange={(e) => edit(i, { title: e.target.value.slice(0, SPEAKER_LIMITS.title) })}
                  placeholder="Jabatan / gelar (opsional)"
                  aria-label={`Jabatan pembicara ${i + 1}`}
                  disabled={disabled}
                  className="field py-1.5 text-xs"
                />
              </div>
              <button type="button" onClick={() => remove(i)} disabled={disabled} className="btn-ghost text-xs">
                Hapus
              </button>
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <>
          <label
            htmlFor={`${id}-file`}
            tabIndex={-1}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!disabled) void add(Array.from(e.dataTransfer.files));
            }}
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-navy-300 bg-white px-4 py-3 text-sm font-semibold text-navy hover:border-navy hover:bg-canvas has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-orange ${
              disabled || busy ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <span aria-hidden="true" className="text-lg leading-none text-orange">
              +
            </span>
            {busy ? "Menyiapkan foto…" : "Upload / paste foto pembicara"}
            <input
              ref={inputRef}
              id={`${id}-file`}
              type="file"
              multiple
              accept={REFERENCE_IMAGE.acceptedTypes.join(",")}
              onChange={(e) => void add(Array.from(e.target.files ?? []))}
              disabled={disabled || busy}
              className="sr-only"
            />
          </label>
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
              placeholder="…atau link foto https://"
              aria-label="Link foto pembicara"
              disabled={disabled || busy}
              className="field min-w-0 flex-1 py-2 text-sm"
            />
            <button type="button" onClick={() => void fromLink()} disabled={disabled || busy || !link.trim()} className="btn-secondary px-4 text-sm">
              Ambil
            </button>
          </div>
        </>
      )}

      {error ? (
        <p role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Foto ditempel apa adanya — wajah, pakaian dan warna kulit tidak diubah AI. Pakai foto jelas, menghadap depan.
        </p>
      )}
    </div>
  );
}
