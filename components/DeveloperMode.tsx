"use client";

import { useId, useState } from "react";

import { copyText } from "@/lib/client-image";
import type { GenerationMeta } from "@/types/generation";

interface Props {
  generatedPrompt: string | null;
  previewLoading: boolean;
  previewError: string | null;
  override: string | null;
  onOverrideChange: (value: string | null) => void;
  lastMeta: GenerationMeta | null;
  disabled?: boolean;
}

/**
 * Prompt optimization panel. Shows the internal prompt and safe request
 * metadata. Never shows the API key, access code or environment variables.
 */
export default function DeveloperMode({
  generatedPrompt,
  previewLoading,
  previewError,
  override,
  onOverrideChange,
  lastMeta,
  disabled,
}: Props) {
  const promptId = useId();
  const [copied, setCopied] = useState(false);
  const editing = override !== null;
  const shown = editing ? override : (generatedPrompt ?? "");

  async function copy() {
    if (await copyText(shown)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <section aria-labelledby={`${promptId}-heading`} className="rounded-xl border border-navy-300/60 bg-pale/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${promptId}-heading`} className="text-xs font-semibold tracking-[0.12em] text-navy uppercase">
          Developer Mode
        </h3>
        <span className="text-[11px] text-muted">Prompt optimization</span>
      </div>

      {editing && (
        <p role="status" className="mt-3 rounded-md bg-orange-100 px-3 py-2 text-xs font-semibold text-navy">
          Manual prompt override active.
        </p>
      )}

      <label htmlFor={promptId} className="label mt-3">
        Generated Prompt
      </label>
      <textarea
        id={promptId}
        value={previewLoading && !editing && !generatedPrompt ? "Building prompt…" : shown}
        readOnly={!editing}
        onChange={(e) => onOverrideChange(e.target.value)}
        rows={editing ? 16 : 10}
        placeholder="Tulis prompt untuk melihat internal prompt."
        className={`field resize-y font-mono text-xs leading-relaxed ${editing ? "" : "bg-white/70 text-navy-700"}`}
        aria-describedby={previewError ? `${promptId}-error` : undefined}
      />
      {previewError && (
        <p id={`${promptId}-error`} className="mt-1 text-xs text-danger">
          {previewError}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={copy} disabled={!shown} className="btn-secondary px-3 py-1.5 text-xs">
          <span aria-live="polite">{copied ? "Copied" : "Copy Prompt"}</span>
        </button>
        {editing ? (
          <button
            type="button"
            onClick={() => onOverrideChange(null)}
            disabled={disabled}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Reset to generated
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOverrideChange(generatedPrompt ?? "")}
            disabled={disabled || !generatedPrompt}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Edit Prompt
          </button>
        )}
      </div>

      {lastMeta && (
        <div className="mt-4">
          <p className="label">Last Request</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            {(
              [
                ["Model", lastMeta.model],
                [
                  "Quality",
                  lastMeta.quality === lastMeta.requestedQuality
                    ? lastMeta.quality
                    : `${lastMeta.quality} (requested ${lastMeta.requestedQuality})`,
                ],
                ["Size", lastMeta.size],
                ["Aspect ratio", `${lastMeta.format.ratio} · ${lastMeta.format.label}${lastMeta.format.autoSelected ? " (auto)" : ""}`],
                ["Output", lastMeta.outputFormat],
                ["Reference", lastMeta.hasReference ? (lastMeta.referenceName ?? "attached") : "none"],
                ["Prompt", lastMeta.promptOverride ? "manual override" : "generated"],
                ["Content type", lastMeta.contentTypes.join(", ")],
                ["Timing", `${(lastMeta.durationMs / 1000).toFixed(1)} s`],
                ...(lastMeta.usage?.totalTokens !== undefined
                  ? ([["Tokens", `${lastMeta.usage.totalTokens} (in ${lastMeta.usage.inputTokens ?? "–"} / out ${lastMeta.usage.outputTokens ?? "–"})`]] as const)
                  : []),
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="font-mono break-all text-navy">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
