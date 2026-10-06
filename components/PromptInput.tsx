"use client";

import { forwardRef, useId } from "react";

import QuickPrompts from "@/components/QuickPrompts";
import { PROMPT_LIMITS } from "@/lib/image-settings";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  error?: string | null;
  disabled?: boolean;
}

const PromptInput = forwardRef<HTMLTextAreaElement, Props>(function PromptInput(
  { value, onChange, onSubmit, error, disabled },
  ref,
) {
  const id = useId();
  const helpId = useId();
  const errorId = useId();
  const nearLimit = value.length > PROMPT_LIMITS.maxLength * 0.9;

  return (
    <div>
      <label htmlFor={id} className="label">
        What do you want to create?
      </label>
      <textarea
        ref={ref}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        rows={6}
        maxLength={PROMPT_LIMITS.maxLength}
        placeholder="Contoh: Poster promo Bootcamp AI Tools untuk karyawan yang ingin bekerja lebih produktif."
        aria-invalid={error ? true : undefined}
        aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
        className="field min-h-36 resize-y leading-relaxed"
      />
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
      <div id={helpId} className="mt-1.5 flex items-start justify-between gap-3 text-xs text-muted">
        <span>
          Tulis bebas. Teks persis dalam tanda kutip, mis. &ldquo;DAFTAR SEKARANG&rdquo;. Ctrl/⌘ + Enter untuk generate.
        </span>
        {nearLimit && (
          <span className="shrink-0 tabular-nums">
            {value.length}/{PROMPT_LIMITS.maxLength}
          </span>
        )}
      </div>
      <QuickPrompts onSelect={onChange} disabled={disabled} />
    </div>
  );
});

export default PromptInput;
