"use client";

import { useEffect, useId } from "react";

import {
  FORMAT_PRESETS,
  IMAGE_MODELS,
  QUALITY_OPTIONS,
  formatSize,
  isValidCustomRatio,
  qualityForModel,
  resolveFormat,
  sizeForModel,
} from "@/lib/image-settings";
import { PRICING, estimateImageCost, formatUsd } from "@/lib/pricing";
import type { GenerationSettings as Settings } from "@/types/generation";
import type { Dimensions, FormatId, QualityId } from "@/types/image";

interface Props {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  autoStory: boolean;
  /** Hidden in Meta Ads mode, where sizes are picked with checkboxes. */
  showFormat?: boolean;
  disabled?: boolean;
  /** Inputs for the price estimate. `images` = how many images one click generates. */
  estimate?: { promptChars: number; referenceImages: number; images: number; sizes?: Dimensions[] };
}

export default function GenerationSettings({ settings, onSettingsChange, autoStory, showFormat = true, disabled, estimate }: Props) {
  const ids = {
    model: useId(),
    quality: useId(),
    format: useId(),
    formatHelp: useId(),
    customW: useId(),
    customH: useId(),
  };

  const update = (patch: Partial<Settings>) => onSettingsChange({ ...settings, ...patch });
  const customValid = isValidCustomRatio(settings.customRatio);
  const resolved = resolveFormat({
    formatId: settings.formatId,
    customRatio: customValid ? settings.customRatio : undefined,
    autoStory: autoStory && !settings.formatExplicit,
  });
  const model = IMAGE_MODELS.find((m) => m.id === settings.model);
  const qualities = QUALITY_OPTIONS.filter((q) => !model || model.qualities.includes(q.id));
  const quality = QUALITY_OPTIONS.find((q) => q.id === settings.quality);

  // Keep the quality valid when switching to a model that does not support it.
  useEffect(() => {
    const q = qualityForModel(settings.model, settings.quality);
    if (q !== settings.quality) onSettingsChange({ ...settings, quality: q });
  }, [settings, onSettingsChange]);

  const sizes = (estimate?.sizes?.length ? estimate.sizes : [resolved.generationSize]).map((s) => sizeForModel(settings.model, s));
  const perClick = estimate
    ? sizes.reduce(
        (sum, size) =>
          sum +
          estimateImageCost({
            model: settings.model,
            quality: qualityForModel(settings.model, settings.quality),
            size,
            promptChars: estimate.promptChars,
            referenceImages: estimate.referenceImages,
          }).usd,
        0,
      ) * Math.max(1, estimate.images)
    : null;
  const verified = PRICING[settings.model]?.verified ?? false;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div>
          <label htmlFor={ids.model} className="label">
            Model
          </label>
          <select
            id={ids.model}
            value={settings.model}
            onChange={(e) => update({ model: e.target.value })}
            disabled={disabled}
            className="select"
            title={model?.description}
          >
            {IMAGE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.quality} className="label">
            Quality
          </label>
          <select
            id={ids.quality}
            value={settings.quality}
            onChange={(e) => update({ quality: e.target.value as QualityId })}
            disabled={disabled}
            className="select"
            title={quality?.description}
          >
            {qualities.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {perClick !== null && (
        <p className="-mt-2 rounded-lg bg-pale/60 px-3 py-2 text-xs text-navy" aria-live="polite">
          Estimasi biaya: <strong>{formatUsd(perClick)}</strong>
          {estimate && estimate.images * sizes.length > 1 ? ` untuk ${estimate.images * sizes.length} gambar` : " per gambar"}
          <span className="text-muted">
            {" "}
            · {verified ? "tarif resmi OpenAI" : "tarif model ini belum dipublikasikan, diasumsikan = GPT-Image 2"} · biaya asli muncul setelah generate
          </span>
        </p>
      )}

      {showFormat && (
        <div>
          <label htmlFor={ids.format} className="label">
            Format
          </label>
          <select
            id={ids.format}
            value={settings.formatId}
            onChange={(e) => update({ formatId: e.target.value as FormatId, formatExplicit: true })}
            disabled={disabled}
            aria-describedby={ids.formatHelp}
            className="select"
          >
            {FORMAT_PRESETS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
                {f.id !== "custom" ? ` ${f.ratio}` : ""}
              </option>
            ))}
          </select>

          {settings.formatId === "custom" && (
            <fieldset className="mt-3 flex items-end gap-2">
              <legend className="sr-only">Custom aspect ratio</legend>
              <div className="flex-1">
                <label htmlFor={ids.customW} className="mb-1 block text-xs text-muted">
                  Width ratio
                </label>
                <input
                  id={ids.customW}
                  type="number"
                  min={1}
                  max={100}
                  inputMode="numeric"
                  value={settings.customRatio.width || ""}
                  onChange={(e) =>
                    update({ customRatio: { ...settings.customRatio, width: Number(e.target.value) } })
                  }
                  disabled={disabled}
                  className="field"
                />
              </div>
              <span aria-hidden="true" className="pb-2.5 text-lg font-semibold text-muted">
                :
              </span>
              <div className="flex-1">
                <label htmlFor={ids.customH} className="mb-1 block text-xs text-muted">
                  Height ratio
                </label>
                <input
                  id={ids.customH}
                  type="number"
                  min={1}
                  max={100}
                  inputMode="numeric"
                  value={settings.customRatio.height || ""}
                  onChange={(e) =>
                    update({ customRatio: { ...settings.customRatio, height: Number(e.target.value) } })
                  }
                  disabled={disabled}
                  className="field"
                />
              </div>
            </fieldset>
          )}

          <p id={ids.formatHelp} className="mt-1.5 text-xs leading-relaxed text-muted" aria-live="polite">
            {settings.formatId === "custom" && !customValid ? (
              <span className="text-danger">Rasio harus antara 1:3 dan 3:1.</span>
            ) : (
              <>
                {resolved.autoSelected && (
                  <span className="font-medium text-navy">Story terdeteksi — otomatis 9:16. </span>
                )}
                Generate {formatSize(resolved.generationSize)}
                {resolved.exportSize ? ` · final ${formatSize(resolved.exportSize)} di Canva` : ""}
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
