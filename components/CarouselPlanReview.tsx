"use client";

import { useId, useState } from "react";

import { copyText } from "@/lib/client-image";
import type { CarouselPlan, CarouselSlidePlan, CarouselStyleGuide, PlanIssue, PlanSource } from "@/types/carousel";

interface Props {
  plan: CarouselPlan;
  issues: PlanIssue[];
  source: PlanSource;
  plannerModel: string | null;
  revisions: number;
  notices: string[];
  devMode: boolean;
  disabled?: boolean;
  onChange: (plan: CarouselPlan) => void;
  onApprove: () => void;
  /** Shown when results from an earlier approval exist. */
  onBackToResults?: () => void;
  loadSlidePrompt: (index: number) => Promise<string>;
}

const STYLE_FIELDS: Array<[keyof CarouselStyleGuide, string]> = [
  ["artDirection", "Art direction"],
  ["background", "Background"],
  ["typography", "Typography"],
  ["layoutGrid", "Layout grid"],
  ["recurringMotif", "Recurring motif"],
];

function StatusBadge({ issues }: { issues: PlanIssue[] }) {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  if (errors > 0) {
    return (
      <span className="rounded-full bg-danger-bg px-2.5 py-1 text-[11px] font-semibold text-danger">
        {errors} masalah
      </span>
    );
  }
  if (warnings > 0) {
    return (
      <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-semibold text-navy">
        {warnings} catatan
      </span>
    );
  }
  return <span className="rounded-full bg-pale px-2.5 py-1 text-[11px] font-semibold text-navy">✓ Terverifikasi</span>;
}

function SlideCard({
  slide,
  issues,
  devMode,
  disabled,
  onChange,
  loadPrompt,
}: {
  slide: CarouselSlidePlan;
  issues: PlanIssue[];
  devMode: boolean;
  disabled?: boolean;
  onChange: (patch: Partial<CarouselSlidePlan>) => void;
  loadPrompt: () => Promise<string>;
}) {
  const id = useId();
  const [prompt, setPrompt] = useState<{ text: string | null; loading: boolean; error: boolean }>({
    text: null,
    loading: false,
    error: false,
  });
  const [copied, setCopied] = useState(false);

  async function showPrompt() {
    setPrompt({ text: null, loading: true, error: false });
    try {
      setPrompt({ text: await loadPrompt(), loading: false, error: false });
    } catch {
      setPrompt({ text: null, loading: false, error: true });
    }
  }

  const field = "field py-2 text-sm";
  return (
    <li className="rounded-xl border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-[0.12em] text-navy uppercase">
          <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-navy text-[11px] text-white">
            {slide.index}
          </span>
          {slide.role}
          {slide.edited && <span className="ml-2 font-normal tracking-normal text-muted normal-case">· diedit</span>}
        </p>
        <StatusBadge issues={issues} />
      </div>

      <div className="grid gap-3">
        <div>
          <label htmlFor={`${id}-h`} className="mb-1 block text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            Headline
          </label>
          <input
            id={`${id}-h`}
            value={slide.headline}
            onChange={(e) => onChange({ headline: e.target.value })}
            disabled={disabled}
            maxLength={120}
            className={`${field} font-semibold`}
          />
        </div>
        <div>
          <label htmlFor={`${id}-s`} className="mb-1 block text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            Supporting text
          </label>
          <input
            id={`${id}-s`}
            value={slide.supportingText}
            onChange={(e) => onChange({ supportingText: e.target.value })}
            disabled={disabled}
            maxLength={300}
            placeholder="(kosong)"
            className={field}
          />
        </div>
        <details className="group">
          <summary className="cursor-pointer list-none text-xs font-semibold text-navy-600 hover:text-navy [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="mr-1 inline-block transition-transform group-open:rotate-90">
              ›
            </span>
            Visual: <span className="font-normal text-muted">{slide.subject || "—"}</span>
          </summary>
          <div className="mt-2 grid gap-3">
            <div>
              <label htmlFor={`${id}-v`} className="mb-1 block text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                Visual concept
              </label>
              <textarea
                id={`${id}-v`}
                value={slide.visualConcept}
                onChange={(e) => onChange({ visualConcept: e.target.value })}
                disabled={disabled}
                rows={3}
                maxLength={800}
                className={`${field} resize-y leading-relaxed`}
              />
            </div>
            <div>
              <label htmlFor={`${id}-sub`} className="mb-1 block text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                Subject
              </label>
              <input
                id={`${id}-sub`}
                value={slide.subject}
                onChange={(e) => onChange({ subject: e.target.value })}
                disabled={disabled}
                maxLength={200}
                className={field}
              />
            </div>
          </div>
        </details>
      </div>

      {issues.length > 0 && (
        <ul className="mt-3 space-y-1">
          {issues.map((issue) => (
            <li
              key={issue.code + issue.message}
              className={`text-xs leading-snug ${issue.severity === "error" ? "text-danger" : "text-navy-600"}`}
            >
              {issue.severity === "error" ? "✕ " : "! "}
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {devMode && (
        <div className="mt-3 border-t border-line pt-3">
          {prompt.text === null ? (
            <button type="button" onClick={showPrompt} disabled={prompt.loading} className="btn-secondary px-3 py-1.5 text-xs">
              {prompt.loading ? "Building prompt…" : "Lihat prompt slide ini"}
            </button>
          ) : (
            <>
              <label htmlFor={`${id}-p`} className="label">
                Generated Prompt · Slide {slide.index}
              </label>
              <textarea
                id={`${id}-p`}
                readOnly
                value={prompt.text}
                rows={8}
                className="field resize-y bg-canvas font-mono text-xs leading-relaxed"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (prompt.text && (await copyText(prompt.text))) {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }
                  }}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  {copied ? "Copied" : "Copy Prompt"}
                </button>
                <button type="button" onClick={showPrompt} className="btn-ghost px-3 py-1.5 text-xs">
                  Refresh
                </button>
              </div>
            </>
          )}
          {prompt.error && <p className="mt-1 text-xs text-danger">Gagal memuat prompt.</p>}
        </div>
      )}
    </li>
  );
}

export default function CarouselPlanReview({
  plan,
  issues,
  source,
  plannerModel,
  revisions,
  notices,
  devMode,
  disabled,
  onChange,
  onApprove,
  onBackToResults,
  loadSlidePrompt,
}: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  const planIssues = issues.filter((i) => i.slideIndex === null);

  function updateSlide(index: number, patch: Partial<CarouselSlidePlan>) {
    onChange({
      ...plan,
      slides: plan.slides.map((s) => (s.index === index ? { ...s, ...patch, edited: true } : s)),
    });
  }

  return (
    <section aria-labelledby="plan-heading" className="panel overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <p className="eyebrow">Carousel Plan · Review</p>
        <h3 id="plan-heading" className="mt-0.5 text-lg font-semibold tracking-tight text-navy uppercase">
          Cek tiap slide sebelum generate
        </h3>
        <p className="mt-1.5 text-xs text-muted">
          {source === "llm" ? (
            <>
              Direncanakan oleh <span className="font-mono text-navy">{plannerModel}</span>
              {revisions > 0 ? ` · ${revisions} revisi otomatis` : ""}
            </>
          ) : (
            "Dibuat dari template"
          )}{" "}
          · Verifikasi: {plan.slides.length} slide, {errors} masalah, {warnings} catatan
        </p>
      </div>

      <div className="space-y-4 p-5">
        {(notices.length > 0 || planIssues.length > 0) && (
          <ul className="space-y-1 rounded-lg bg-pale px-4 py-3 text-xs text-navy">
            {notices.map((n) => (
              <li key={n}>{n}</li>
            ))}
            {planIssues.map((i) => (
              <li key={i.message}>! {i.message}</li>
            ))}
          </ul>
        )}

        <details className="rounded-xl border border-line bg-canvas p-4">
          <summary className="cursor-pointer text-xs font-semibold tracking-[0.1em] text-navy uppercase">
            Shared style guide <span className="font-normal tracking-normal text-muted normal-case">— dipakai di semua slide</span>
          </summary>
          <div className="mt-3 grid gap-3">
            {STYLE_FIELDS.map(([key, label]) => (
              <div key={key}>
                <label htmlFor={`style-${key}`} className="mb-1 block text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  {label}
                </label>
                <textarea
                  id={`style-${key}`}
                  value={plan.style[key]}
                  onChange={(e) => onChange({ ...plan, style: { ...plan.style, [key]: e.target.value } })}
                  disabled={disabled}
                  rows={2}
                  maxLength={400}
                  className="field resize-y py-2 text-sm"
                />
              </div>
            ))}
          </div>
        </details>

        <ol className="grid gap-3 xl:grid-cols-2">
          {plan.slides.map((slide) => (
            <SlideCard
              key={slide.index}
              slide={slide}
              issues={issues.filter((i) => i.slideIndex === slide.index)}
              devMode={devMode}
              disabled={disabled}
              onChange={(patch) => updateSlide(slide.index, patch)}
              loadPrompt={() => loadSlidePrompt(slide.index)}
            />
          ))}
        </ol>

        <div className="border-t border-line pt-4">
          {errors > 0 && (
            <label className="mb-3 flex items-start gap-2 text-sm text-navy">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-navy"
              />
              <span>
                Masih ada {errors} masalah. Perbaiki di atas, atau centang jika sudah dicek dan tetap ingin generate.
              </span>
            </label>
          )}
          <button
            type="button"
            onClick={onApprove}
            disabled={disabled || (errors > 0 && !acknowledged)}
            className="btn h-14 w-full bg-orange text-[19px] font-bold tracking-[0.06em] text-white hover:bg-orange-hover disabled:opacity-60"
          >
            APPROVE &amp; GENERATE {plan.slides.length} SLIDES
          </button>
          {onBackToResults && (
            <button
              type="button"
              onClick={onBackToResults}
              className="mt-2 w-full text-center text-xs font-semibold text-muted hover:text-navy"
            >
              ← Kembali ke hasil sebelumnya (tanpa generate ulang)
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
