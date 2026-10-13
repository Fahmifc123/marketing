"use client";

import { useId, useState } from "react";

import { copyText } from "@/lib/client-image";
import {
  META_COPY_LIMITS,
  META_CTA_BUTTONS,
  copySource,
  formatCopyForAdsManager,
  verifyMetaAdCopy,
  type MetaAdCopy as Copy,
  type MetaCopyInput,
  type MetaCopyResponse,
  type MetaCtaButton,
} from "@/lib/meta-copy";

interface Props {
  apiKey: string;
  input: MetaCopyInput;
  onApiKeyError: (message: string) => void;
  disabled?: boolean;
}

function Counter({ value, limit }: { value: string; limit: number }) {
  const over = value.length > limit;
  return (
    <span className={`text-[11px] tabular-nums ${over ? "font-semibold text-orange-hover" : "text-muted"}`}>
      {value.length}/{limit}
    </span>
  );
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <button
      type="button"
      disabled={!value}
      onClick={async () => {
        setState((await copyText(value)) ? "ok" : "fail");
        setTimeout(() => setState("idle"), 1500);
      }}
      className="text-[11px] font-semibold text-navy-600 hover:text-navy disabled:opacity-40"
    >
      {state === "ok" ? "Copied" : state === "fail" ? "Gagal" : label}
    </button>
  );
}

/** Ads Manager copy for the carousel: primary text variants, card headlines/descriptions and CTA button. */
export default function MetaAdCopy({ apiKey, input, onApiKeyError, disabled }: Props) {
  const id = useId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copy, setCopy] = useState<Copy | null>(null);
  const [meta, setMeta] = useState<{ model: string; revisions: number } | null>(null);
  const [primaryIndex, setPrimaryIndex] = useState(0);

  const cardCount = input.slides.length;
  const stale = copy !== null && copy.cards.length !== cardCount;
  const issues = copy && !stale ? verifyMetaAdCopy(copy, copySource(input)) : [];
  const issuesFor = (field: string) => issues.filter((i) => i.field === field && i.severity === "error");

  async function generate() {
    const key = apiKey.trim();
    if (!key) {
      onApiKeyError("Masukkan OpenAI API key terlebih dahulu.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/meta-ads/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key, ...input }),
      });
      const data = (await res.json()) as MetaCopyResponse | { ok: false; error: { code: string; message: string } };
      if (!data.ok) {
        if (data.error.code === "unauthorized") window.location.replace("/login");
        if (data.error.code === "invalid_api_key") onApiKeyError(data.error.message);
        throw new Error(data.error.message);
      }
      setCopy(data.copy);
      setMeta({ model: data.model, revisions: data.revisions });
      setPrimaryIndex(0);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Gagal membuat copy. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  function updateCard(index: number, field: "headline" | "description", value: string) {
    if (!copy) return;
    setCopy({ ...copy, cards: copy.cards.map((c, i) => (i === index ? { ...c, [field]: value } : c)) });
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="eyebrow">Ads Manager</p>
          <h3 id={`${id}-heading`} className="mt-0.5 text-lg font-semibold tracking-tight text-navy uppercase">
            Copy iklan
          </h3>
          <p className="mt-1 text-xs text-muted">
            Primary text, headline &amp; description per kartu, dan tombol CTA — dari prompt &amp; teks kartu kamu, tanpa fakta karangan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {copy && !stale && (
            <CopyButton value={formatCopyForAdsManager(copy, primaryIndex)} label="Copy semua" />
          )}
          <button
            type="button"
            onClick={() => void generate()}
            disabled={disabled || loading}
            className="btn bg-navy text-white hover:bg-navy-700"
          >
            {loading ? "Menulis copy…" : copy ? "Buat ulang" : "Buat copy iklan"}
          </button>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {error && (
          <p role="alert" className="rounded-lg border border-danger/20 bg-danger-bg px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        {!copy && !error && (
          <p className="text-sm text-muted">
            Klik <span className="font-semibold text-navy">Buat copy iklan</span> setelah prompt slide siap. Biaya: 1–2 panggilan model teks.
          </p>
        )}
        {stale && (
          <p className="rounded-lg bg-orange-100 px-4 py-3 text-sm text-navy">
            Jumlah kartu berubah sejak copy dibuat. Klik <span className="font-semibold">Buat ulang</span>.
          </p>
        )}

        {copy && !stale && (
          <>
            {meta && (
              <p className="text-xs text-muted">
                Ditulis oleh <span className="font-mono text-navy">{meta.model}</span>
                {meta.revisions ? ` · ${meta.revisions} revisi otomatis` : ""} · Verifikasi:{" "}
                {issues.filter((i) => i.severity === "error").length} masalah, {issues.filter((i) => i.severity === "warning").length}{" "}
                catatan
              </p>
            )}

            <fieldset>
              <legend className="label">Primary text — pilih satu varian</legend>
              <div className="space-y-3">
                {copy.primaryTexts.map((text, i) => (
                  <div
                    key={i}
                    className={`rounded-xl border p-3 ${primaryIndex === i ? "border-navy bg-pale/50" : "border-line bg-white"}`}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-navy">
                        <input
                          type="radio"
                          name={`${id}-primary`}
                          checked={primaryIndex === i}
                          onChange={() => setPrimaryIndex(i)}
                          className="accent-navy"
                        />
                        Varian {i + 1}
                      </label>
                      <span className="flex items-center gap-3">
                        <Counter value={text} limit={META_COPY_LIMITS.primaryText} />
                        <CopyButton value={text} />
                      </span>
                    </div>
                    <textarea
                      value={text}
                      onChange={(e) =>
                        setCopy({ ...copy, primaryTexts: copy.primaryTexts.map((t, j) => (j === i ? e.target.value : t)) })
                      }
                      rows={3}
                      aria-label={`Primary text varian ${i + 1}`}
                      className="field resize-y text-sm leading-relaxed"
                    />
                    {issuesFor(`primary-${i}`).map((issue) => (
                      <p key={issue.message} className="mt-1 text-xs text-danger">
                        ✕ {issue.message}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </fieldset>

            <div>
              <p className="label">Per kartu</p>
              <ol className="space-y-2">
                {copy.cards.map((card, i) => (
                  <li key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[auto_1fr_1fr] sm:items-start">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white">
                      {i + 1}
                    </span>
                    {(["headline", "description"] as const).map((field) => (
                      <div key={field}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <label
                            htmlFor={`${id}-${i}-${field}`}
                            className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase"
                          >
                            {field === "headline" ? "Headline" : "Description"}
                          </label>
                          <span className="flex items-center gap-3">
                            <Counter value={card[field]} limit={META_COPY_LIMITS[field]} />
                            <CopyButton value={card[field]} />
                          </span>
                        </div>
                        <input
                          id={`${id}-${i}-${field}`}
                          value={card[field]}
                          onChange={(e) => updateCard(i, field, e.target.value)}
                          className={`field py-2 text-sm ${field === "headline" ? "font-semibold" : ""}`}
                        />
                        {issuesFor(`card-${i}-${field}`).map((issue) => (
                          <p key={issue.message} className="mt-1 text-xs text-danger">
                            ✕ {issue.message}
                          </p>
                        ))}
                      </div>
                    ))}
                  </li>
                ))}
              </ol>
            </div>

            <div className="grid gap-3 sm:grid-cols-[220px_1fr] sm:items-end">
              <div>
                <label htmlFor={`${id}-cta`} className="label">
                  Tombol CTA (Ads Manager)
                </label>
                <select
                  id={`${id}-cta`}
                  value={copy.ctaButton}
                  onChange={(e) => setCopy({ ...copy, ctaButton: e.target.value as MetaCtaButton })}
                  className="select py-2 text-sm"
                >
                  {META_CTA_BUTTONS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              {copy.ctaReason && <p className="pb-2 text-xs text-muted">{copy.ctaReason}</p>}
            </div>

            <p className="text-xs text-muted">
              Website URL tidak dibuat otomatis — isi URL landing page yang benar langsung di Ads Manager.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
