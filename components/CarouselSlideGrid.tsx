"use client";

import { useRef, useState } from "react";

import type { CarouselSlidePlan, SlideJobStatus } from "@/types/carousel";
import type { Dimensions } from "@/types/image";

export interface SlideJob {
  status: SlideJobStatus;
  url?: string;
  blob?: Blob;
  error?: string;
}

interface Props {
  slides: CarouselSlidePlan[];
  jobs: Record<number, SlideJob>;
  frame: Dimensions;
  running: boolean;
  usesStyleAnchor: boolean;
  notices: string[];
  onRetry: (index: number) => void;
  onDownload: (index: number) => void;
  onDownloadAll: () => void;
  onCancel: () => void;
  onEditPlan: () => void;
}

export default function CarouselSlideGrid({
  slides,
  jobs,
  frame,
  running,
  usesStyleAnchor,
  notices,
  onRetry,
  onDownload,
  onDownloadAll,
  onCancel,
  onEditPlan,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const done = slides.filter((s) => jobs[s.index]?.status === "done").length;
  const failed = slides.filter((s) => jobs[s.index]?.status === "error").length;
  const viewingJob = viewing !== null ? jobs[viewing] : undefined;

  function open(index: number) {
    setViewing(index);
    requestAnimationFrame(() => dialogRef.current?.showModal());
  }

  return (
    <section aria-labelledby="slides-heading" className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="eyebrow">Carousel · {slides.length} slides</p>
          <h3 id="slides-heading" className="mt-0.5 text-lg font-semibold tracking-tight text-navy uppercase">
            {running ? "Creating your carousel…" : failed > 0 ? "Sebagian slide gagal" : "Your carousel is ready"}
          </h3>
          <p className="mt-1 text-xs text-muted" aria-live="polite">
            {done}/{slides.length} selesai{failed > 0 ? ` · ${failed} gagal` : ""}
            {usesStyleAnchor ? " · Slide 1 dipakai sebagai style anchor" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {running ? (
            <button type="button" onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
          ) : (
            <>
              <button type="button" onClick={onEditPlan} className="btn-secondary">
                Edit Plan
              </button>
              <button
                type="button"
                onClick={onDownloadAll}
                disabled={done === 0}
                className="btn bg-navy text-white hover:bg-navy-700"
              >
                Download All (.zip)
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-5">
        <div className="mb-4 h-1 overflow-hidden rounded-full bg-pale" aria-hidden="true">
          <div className="h-full bg-orange transition-all" style={{ width: `${(done / slides.length) * 100}%` }} />
        </div>

        {notices.length > 0 && (
          <ul className="mb-4 space-y-1 rounded-lg bg-pale px-4 py-3 text-xs text-navy">
            {notices.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}

        <ol className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {slides.map((slide) => {
            const job = jobs[slide.index] ?? { status: "queued" };
            return (
              <li key={slide.index} className="min-w-0">
                <div
                  className="relative flex items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas"
                  style={{ aspectRatio: `${frame.width} / ${frame.height}` }}
                >
                  {job.status === "done" && job.url ? (
                    <button
                      type="button"
                      onClick={() => open(slide.index)}
                      className="h-full w-full cursor-zoom-in"
                      aria-label={`Open slide ${slide.index}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                      <img
                        src={job.url}
                        alt={`Slide ${slide.index} (${slide.role}): ${slide.headline}`}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ) : job.status === "generating" ? (
                    <>
                      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
                        <div className="animate-shimmer absolute inset-y-0 -left-1/2 w-[200%] bg-gradient-to-r from-transparent via-white to-transparent" />
                      </div>
                      <p className="relative text-[11px] font-semibold tracking-[0.12em] text-navy uppercase">Generating…</p>
                    </>
                  ) : job.status === "error" ? (
                    <div className="px-3 text-center">
                      <p className="text-xs text-danger">{job.error}</p>
                      {!running && (
                        <button type="button" onClick={() => onRetry(slide.index)} className="btn-secondary mt-2 px-3 py-1.5 text-xs">
                          Retry
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] font-medium text-muted">Menunggu…</p>
                  )}
                  {usesStyleAnchor && slide.index === 1 && (
                    <span className="absolute top-2 left-2 rounded-full bg-navy px-2 py-0.5 text-[10px] font-semibold text-white">
                      Style anchor
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-start justify-between gap-2">
                  <p className="min-w-0 text-xs leading-snug text-navy">
                    <span className="font-semibold">
                      {slide.index} · {slide.role}
                    </span>
                    <span className="block truncate text-muted" title={slide.headline}>
                      {slide.headline || "—"}
                    </span>
                  </p>
                  {job.status === "done" && !running && (
                    <div className="flex shrink-0 gap-2 text-[11px] font-semibold">
                      <button type="button" onClick={() => onDownload(slide.index)} className="text-navy-600 hover:text-navy">
                        Download
                      </button>
                      <button type="button" onClick={() => onRetry(slide.index)} className="text-navy-600 hover:text-navy">
                        Regenerate
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <dialog
        ref={dialogRef}
        aria-label="Fullscreen slide"
        onClose={() => setViewing(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogRef.current?.close();
        }}
        className="m-auto max-h-none max-w-none bg-transparent p-0 backdrop:bg-navy/90"
      >
        {viewing !== null && viewingJob?.url && (
          <div className="flex h-dvh w-dvw flex-col items-center justify-center gap-3 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
            <img src={viewingJob.url} alt={`Slide ${viewing}`} className="max-h-[calc(100dvh-5rem)] max-w-full rounded-lg object-contain" />
            <div className="flex gap-2">
              {viewing > 1 && (
                <button type="button" onClick={() => setViewing(viewing - 1)} className="btn border border-white/40 text-white hover:bg-white/10">
                  ← Prev
                </button>
              )}
              <button type="button" onClick={() => onDownload(viewing)} className="btn bg-white text-navy hover:bg-pale">
                Download
              </button>
              <button type="button" autoFocus onClick={() => dialogRef.current?.close()} className="btn border border-white/40 text-white hover:bg-white/10">
                Close
              </button>
              {viewing < slides.length && jobs[viewing + 1]?.url && (
                <button type="button" onClick={() => setViewing(viewing + 1)} className="btn border border-white/40 text-white hover:bg-white/10">
                  Next →
                </button>
              )}
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
