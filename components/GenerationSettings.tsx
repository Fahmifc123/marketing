"use client";

import { forwardRef, useId, useState } from "react";

import {
  FORMAT_PRESETS,
  IMAGE_MODELS,
  QUALITY_OPTIONS,
  formatSize,
  isValidCustomRatio,
  resolveFormat,
} from "@/lib/image-settings";
import type { GenerationSettings as Settings } from "@/types/generation";
import type { FormatId, QualityId } from "@/types/image";

interface Props {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  apiKeyError?: string | null;
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  autoStory: boolean;
  disabled?: boolean;
}

const GenerationSettings = forwardRef<HTMLInputElement, Props>(function GenerationSettings(
  { apiKey, onApiKeyChange, apiKeyError, settings, onSettingsChange, autoStory, disabled },
  apiKeyRef,
) {
  const ids = {
    key: useId(),
    keyHelp: useId(),
    keyError: useId(),
    model: useId(),
    quality: useId(),
    format: useId(),
    formatHelp: useId(),
    customW: useId(),
    customH: useId(),
  };
  const [showKey, setShowKey] = useState(false);

  const update = (patch: Partial<Settings>) => onSettingsChange({ ...settings, ...patch });
  const customValid = isValidCustomRatio(settings.customRatio);
  const resolved = resolveFormat({
    formatId: settings.formatId,
    customRatio: customValid ? settings.customRatio : undefined,
    autoStory: autoStory && !settings.formatExplicit,
  });
  const model = IMAGE_MODELS.find((m) => m.id === settings.model);
  const quality = QUALITY_OPTIONS.find((q) => q.id === settings.quality);

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor={ids.key} className="label">
          OpenAI API Key
        </label>
        <div className="relative">
          <input
            ref={apiKeyRef}
            id={ids.key}
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="sk-••••••••••••••••••••••••"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            aria-invalid={apiKeyError ? true : undefined}
            aria-describedby={`${ids.keyHelp}${apiKeyError ? ` ${ids.keyError}` : ""}`}
            className="field pr-20 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            aria-pressed={showKey}
            aria-controls={ids.key}
            className="absolute inset-y-1 right-1 rounded-md px-3 text-xs font-semibold text-navy hover:bg-pale"
          >
            {showKey ? "Hide" : "Show"}
          </button>
        </div>
        {apiKeyError && (
          <p id={ids.keyError} role="alert" className="mt-1.5 text-sm text-danger">
            {apiKeyError}
          </p>
        )}
        <p id={ids.keyHelp} className="mt-1.5 text-xs leading-relaxed text-muted">
          Disimpan hanya di memori tab ini — tidak disimpan, tidak dicatat, dan hilang saat logout atau refresh.
        </p>
      </div>

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
            {QUALITY_OPTIONS.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label}
              </option>
            ))}
          </select>
        </div>
      </div>

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
    </div>
  );
});

export default GenerationSettings;
