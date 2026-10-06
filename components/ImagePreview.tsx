"use client";

import { useEffect, useRef, useState } from "react";

import type { CreativeResult } from "@/types/generation";
import type { Dimensions } from "@/types/image";

export type PreviewStatus = "idle" | "loading" | "success" | "error";

interface Props {
  status: PreviewStatus;
  result: CreativeResult | null;
  error: string | null;
  frame: Dimensions;
  onDownload: () => void;
  onRegenerate: () => void;
  onCopyPrompt: () => Promise<boolean>;
  onNewCreation: () => void;
}

function formatTime(ts: number) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(ts);
}

export default function ImagePreview({
  status,
  result,
  error,
  frame,
  onDownload,
  onRegenerate,
  onCopyPrompt,
  onNewCreation,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const loading = status === "loading";
  const showImage = result && !loading;

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const title = loading ? "Creating your visual…" : showImage ? "Your creative is ready" : "Ready when you are";

  return (
    <section aria-labelledby="preview-heading" className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
        <div>
          <p className="eyebrow">Creative Preview</p>
          <h3 id="preview-heading" className="mt-0.5 text-lg font-semibold tracking-tight text-navy uppercase">
            {title}
          </h3>
        </div>
        {showImage && (
          <p className="text-xs text-muted">
            {result.modelLabel} · {result.formatLabel} {result.aspectRatio} · {result.size}
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="mx-5 mt-4 rounded-lg border border-danger/20 bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="p-5">
        <div aria-live="polite" aria-busy={loading} className="flex justify-center rounded-xl bg-canvas">
          {showImage ? (
            <button
              type="button"
              onClick={() => dialogRef.current?.showModal()}
              className="group relative block cursor-zoom-in"
              aria-label="Open fullscreen"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
              <img
                src={result.url}
                alt={`Generated visual: ${result.prompt}`}
                className="max-h-[72vh] w-auto rounded-xl object-contain"
              />
            </button>
          ) : (
            <div
              className="relative flex w-full max-w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-white"
              style={{
                aspectRatio: `${frame.width} / ${frame.height}`,
                maxHeight: "72vh",
                width: frame.height > frame.width ? `min(100%, calc(72vh * ${frame.width / frame.height}))` : "100%",
              }}
            >
              {loading ? (
                <>
                  <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
                    <div className="animate-shimmer absolute inset-y-0 -left-1/2 w-[200%] bg-gradient-to-r from-transparent via-pale/80 to-transparent" />
                  </div>
                  <div className="relative px-6 text-center">
                    <span aria-hidden="true" className="animate-breathe mx-auto mb-5 block h-2.5 w-2.5 rounded-full bg-orange" />
                    <p className="text-sm font-semibold tracking-[0.14em] text-navy uppercase">Creating your visual…</p>
                    <p className="mt-2 text-sm text-muted">Applying Intelligo ID visual system…</p>
                  </div>
                </>
              ) : (
                <div className="px-6 text-center">
                  <span aria-hidden="true" className="mx-auto mb-5 block h-px w-10 bg-orange" />
                  <p className="text-sm font-semibold tracking-[0.14em] text-navy uppercase">Your creative space</p>
                  <p className="mt-2 text-sm text-muted">Describe what you want to create.</p>
                  <p className="mt-1 text-xs text-muted">Your Intelligo ID visual system will be applied automatically.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {showImage && (
          <>
            {result.meta?.notices && result.meta.notices.length > 0 && (
              <ul className="mt-4 space-y-1 rounded-lg bg-pale px-4 py-3 text-xs text-navy">
                {result.meta.notices.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onDownload}
                className="btn bg-navy text-white hover:bg-navy-700"
              >
                Download
              </button>
              <button type="button" onClick={onRegenerate} className="btn-secondary">
                Regenerate
              </button>
              <button
                type="button"
                onClick={async () => setCopied((await onCopyPrompt()) ? "ok" : "fail")}
                className="btn-secondary"
              >
                <span aria-live="polite">{copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed" : "Copy Prompt"}</span>
              </button>
              <button type="button" onClick={() => dialogRef.current?.showModal()} className="btn-secondary">
                Open Fullscreen
              </button>
              <button type="button" onClick={onNewCreation} className="btn-ghost sm:ml-auto">
                New Creation
              </button>
            </div>
            <p className="mt-3 line-clamp-2 text-xs text-muted" title={result.prompt}>
              <span className="font-semibold text-navy">Prompt:</span> {result.prompt} · {formatTime(result.createdAt)}
            </p>
          </>
        )}
      </div>

      {result && (
        <dialog
          ref={dialogRef}
          aria-label="Fullscreen preview"
          onClick={(e) => {
            if (e.target === e.currentTarget) dialogRef.current?.close();
          }}
          className="m-auto max-h-none max-w-none bg-transparent p-0 backdrop:bg-navy/90"
        >
          <div className="flex h-dvh w-dvw flex-col items-center justify-center gap-3 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
            <img
              src={result.url}
              alt={`Generated visual: ${result.prompt}`}
              className="max-h-[calc(100dvh-5rem)] max-w-full rounded-lg object-contain"
            />
            <div className="flex gap-2">
              <button type="button" onClick={onDownload} className="btn bg-white text-navy hover:bg-pale">
                Download
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => dialogRef.current?.close()}
                className="btn border border-white/40 text-white hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
}
