"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import type { ReferenceImage } from "@/components/ReferenceUploader";
import {
  base64ToBlob,
  copyText,
  createThumbnail,
  downloadBlob,
  exportExactSize,
  fileTimestamp,
  prepareStyleAnchor,
} from "@/lib/client-image";
import { META_AD_SIZES, META_ADS_LIMITS, parsePastedPrompt, type MetaAdSize, type MetaSizeId } from "@/lib/meta-ads";
import { runPool } from "@/lib/pool";
import { createZip } from "@/lib/zip";
import type { SlideJobStatus } from "@/types/carousel";
import type { GenerateResponse, GenerationSettings as Settings } from "@/types/generation";
import type { HistoryItem } from "@/types/image";

interface Props {
  apiKey: string;
  settings: Settings;
  reference: ReferenceImage | null;
  devMode: boolean;
  controls: ReactNode;
  onApiKeyError: (message: string) => void;
  onSaveToHistory: (item: HistoryItem) => Promise<void>;
  footer?: ReactNode;
}

interface Job {
  status: SlideJobStatus;
  blob?: Blob;
  url?: string;
  error?: string;
}

interface Draft {
  shared: string;
  slides: string[];
}

type Result = { ok: true; blob: Blob } | { ok: false; code: string; message: string };

const FATAL_CODES = new Set(["unauthorized", "invalid_api_key", "missing_api_key", "insufficient_quota", "permission_denied"]);
const key = (slide: number, size: MetaSizeId) => `${slide}-${size}`;

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const EXAMPLE = `Gaya umum: clean editorial, background off-white, headline navy bold, aksen oranye untuk CTA.

Slide 1: Hook — headline "KERJAAN MAKIN BANYAK?" dengan foto karyawan Indonesia di meja kerja yang penuh dokumen.
Slide 2: Problem — visual to-do list panjang dan jam dinding, headline "WAKTU TERASA MAKIN SEDIKIT".
Slide 3: Solusi — karyawan memakai AI tools di laptop dengan ekspresi lega, headline "KERJA LEBIH CERDAS DENGAN AI".
Slide 4: CTA — layout bersih dengan tombol oranye "DAFTAR BOOTCAMP AI TOOLS".`;

function PromptPreview({ load }: { load: () => Promise<string> }) {
  const [state, setState] = useState<{ text: string | null; loading: boolean; error: boolean }>({
    text: null,
    loading: false,
    error: false,
  });
  const [copied, setCopied] = useState(false);
  if (state.text === null) {
    return (
      <div>
        <button
          type="button"
          disabled={state.loading}
          onClick={async () => {
            setState({ text: null, loading: true, error: false });
            try {
              setState({ text: await load(), loading: false, error: false });
            } catch {
              setState({ text: null, loading: false, error: true });
            }
          }}
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          {state.loading ? "Building prompt…" : "Lihat prompt final"}
        </button>
        {state.error && <p className="mt-1 text-xs text-danger">Gagal memuat prompt.</p>}
      </div>
    );
  }
  return (
    <div>
      <textarea readOnly value={state.text} rows={8} className="field resize-y bg-canvas font-mono text-xs leading-relaxed" />
      <button
        type="button"
        onClick={async () => {
          if (state.text && (await copyText(state.text))) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
        className="btn-secondary mt-2 px-3 py-1.5 text-xs"
      >
        {copied ? "Copied" : "Copy Prompt"}
      </button>
    </div>
  );
}

export default function MetaAdsGenerator({
  apiKey,
  settings,
  reference,
  devMode,
  controls,
  onApiKeyError,
  onSaveToHistory,
  footer,
}: Props) {
  const pasteId = useId();
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MetaSizeId[]>(META_AD_SIZES.map((s) => s.id));
  const [useAnchor, setUseAnchor] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<"review" | "results">("review");
  const [approved, setApproved] = useState<{ draft: Draft; sizes: MetaAdSize[] } | null>(null);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [running, setRunning] = useState(false);
  const [notices, setNotices] = useState<string[]>([]);
  const [viewing, setViewing] = useState<{ slide: number; size: MetaAdSize } | null>(null);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const runAbort = useRef<AbortController | null>(null);
  const urlsRef = useRef<Map<string, string>>(new Map());
  /** Downsized master-size image per slide, used as the reference for its other sizes. */
  const mastersRef = useRef<Map<number, File>>(new Map());
  const groupIdRef = useRef("");

  const sizes = META_AD_SIZES.filter((s) => selected.includes(s.id));
  const livePreview = parsePastedPrompt(paste);
  const slideCount = draft?.slides.length ?? 0;
  const tooMany = slideCount > META_ADS_LIMITS.maxSlides;
  const emptySlide = draft?.slides.some((s) => s.trim().length < META_ADS_LIMITS.minSlideLength) ?? false;
  const total = slideCount * sizes.length;

  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      runAbort.current?.abort();
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  function validateKey(): boolean {
    const k = apiKey.trim();
    if (!k) {
      onApiKeyError("Masukkan OpenAI API key terlebih dahulu.");
      return false;
    }
    if (!/^sk-\S{16,}$/.test(k)) {
      onApiKeyError("API key tidak valid. Periksa kembali API key kamu.");
      return false;
    }
    return true;
  }

  function splitPaste() {
    const parsed = parsePastedPrompt(paste);
    if (parsed.slides.length === 0) {
      setPasteError("Tempel dulu prompt dari ChatGPT.");
      return;
    }
    if (draft && !window.confirm("Pisahkan ulang? Editan di review akan diganti dengan hasil tempelan terbaru.")) return;
    setPasteError(null);
    setDraft(parsed);
    setView("review");
    setError(null);
  }

  function updateSlide(index: number, text: string) {
    if (!draft) return;
    setDraft({ ...draft, slides: draft.slides.map((s, i) => (i === index ? text : s)) });
  }

  async function loadPrompt(slideIndex: number, size: MetaAdSize): Promise<string> {
    if (!draft) throw new Error("No draft");
    const master = sizes[0];
    const res = await fetch("/api/meta-ads/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sharedContext: draft.shared,
        slidePrompt: draft.slides[slideIndex - 1],
        slideIndex,
        totalSlides: draft.slides.length,
        sizeId: size.id,
        quality: settings.quality,
        hasStyleAnchor: useAnchor && slideIndex > 1 && size.id === master?.id,
        hasSizeMaster: size.id !== master?.id,
        hasReference: Boolean(reference),
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error?.message ?? "Failed");
    return data.prompt as string;
  }

  // ---------- generation ----------

  function setJob(id: string, job: Job) {
    const old = urlsRef.current.get(id);
    if (old && old !== job.url) {
      URL.revokeObjectURL(old);
      urlsRef.current.delete(id);
    }
    if (job.url) urlsRef.current.set(id, job.url);
    setJobs((prev) => ({ ...prev, [id]: job }));
  }

  async function generateCard(
    target: Draft,
    slide: number,
    size: MetaAdSize,
    refs: { styleAnchor?: File | null; sizeMaster?: File | null },
    signal: AbortSignal,
  ): Promise<Result> {
    const id = key(slide, size.id);
    setJob(id, { status: "generating" });

    const form = new FormData();
    form.set("apiKey", apiKey.trim());
    form.set("prompt", target.slides[slide - 1]);
    form.set("model", settings.model);
    form.set("quality", settings.quality);
    form.set("formatId", size.formatId);
    form.set("formatExplicit", "true");
    form.set(
      "metaAd",
      JSON.stringify({
        sharedContext: target.shared,
        slidePrompt: target.slides[slide - 1],
        slideIndex: slide,
        totalSlides: target.slides.length,
      }),
    );
    if (refs.sizeMaster) form.set("sizeMaster", refs.sizeMaster, refs.sizeMaster.name);
    if (refs.styleAnchor) form.set("styleAnchor", refs.styleAnchor, refs.styleAnchor.name);
    if (reference) form.set("referenceImage", reference.file, reference.file.name);
    form.set("developerMode", String(devMode));

    try {
      const res = await fetch("/api/generate", { method: "POST", body: form, signal });
      let data: GenerateResponse;
      try {
        data = (await res.json()) as GenerateResponse;
      } catch {
        throw new Error("Generation gagal. Coba lagi.");
      }
      if (!data.ok) {
        if (data.error.code === "unauthorized") window.location.replace("/login");
        if (data.error.code === "invalid_api_key") onApiKeyError(data.error.message);
        setJob(id, { status: "error", error: data.error.message });
        return { ok: false, code: data.error.code, message: data.error.message };
      }

      const blob = base64ToBlob(data.image.b64, data.image.mimeType);
      setJob(id, { status: "done", blob, url: URL.createObjectURL(blob) });
      try {
        const { meta } = data;
        await onSaveToHistory({
          id: newId(),
          createdAt: meta.createdAt,
          prompt: target.slides[slide - 1],
          model: meta.model,
          modelLabel: meta.modelLabel,
          quality: meta.quality,
          formatId: meta.format.id,
          formatLabel: `Meta ${size.label}`,
          aspectRatio: size.ratio,
          size: meta.size,
          mimeType: data.image.mimeType,
          image: blob,
          thumbnail: await createThumbnail(blob),
          carousel: { groupId: groupIdRef.current, index: slide, total: target.slides.length, role: `Meta ${size.ratio}` },
        });
      } catch {
        // History is a convenience only.
      }
      return { ok: true, blob };
    } catch (err) {
      const aborted = (err as Error).name === "AbortError";
      const message = aborted ? "Dibatalkan." : (err as Error).message || "Generation gagal. Coba lagi.";
      setJob(id, { status: "error", error: message });
      return { ok: false, code: aborted ? "aborted" : "generation_failed", message };
    }
  }

  async function rememberMaster(slide: number, blob: Blob) {
    try {
      mastersRef.current.set(slide, await prepareStyleAnchor(blob, META_ADS_LIMITS.anchorMaxEdge));
    } catch {
      mastersRef.current.delete(slide);
    }
  }

  async function generateAll() {
    if (!draft || running || tooMany || emptySlide || sizes.length === 0 || !validateKey()) return;
    const target: Draft = { shared: draft.shared.trim(), slides: draft.slides.map((s) => s.trim()) };
    const chosen = sizes;
    const [master, ...others] = chosen;
    const controller = new AbortController();
    runAbort.current = controller;
    groupIdRef.current = newId();
    mastersRef.current.clear();
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current.clear();

    const initial: Record<string, Job> = {};
    target.slides.forEach((_, i) => chosen.forEach((s) => (initial[key(i + 1, s.id)] = { status: "queued" })));
    setJobs(initial);
    setApproved({ draft: target, sizes: chosen });
    setView("results");
    setRunning(true);
    setNotices([]);
    setError(null);

    let stopped = false;
    const runNotices: string[] = [];
    const check = (r: Result) => {
      if (!r.ok && FATAL_CODES.has(r.code) && !stopped) {
        stopped = true;
        runNotices.push(`Generate dihentikan: ${r.message}`);
      }
    };
    const halted = () => stopped || controller.signal.aborted;
    const slideNumbers = target.slides.map((_, i) => i + 1);

    // 1. Card 1 in the master size — the style anchor for the whole carousel.
    const first = await generateCard(target, 1, master, {}, controller.signal);
    check(first);
    if (first.ok) await rememberMaster(1, first.blob);
    const anchor = useAnchor ? (mastersRef.current.get(1) ?? null) : null;

    // 2. Remaining cards in the master size, in parallel.
    if (!halted()) {
      await runPool(
        slideNumbers.slice(1),
        META_ADS_LIMITS.concurrency,
        async (slide) => {
          const r = await generateCard(target, slide, master, { styleAnchor: anchor }, controller.signal);
          check(r);
          if (r.ok) await rememberMaster(slide, r.blob);
        },
        halted,
      );
    }

    // 3. Other sizes, each adapted from the same card in the master size.
    if (!halted() && others.length > 0) {
      const tasks = slideNumbers.flatMap((slide) => others.map((size) => ({ slide, size })));
      await runPool(
        tasks,
        META_ADS_LIMITS.concurrency,
        async ({ slide, size }) => {
          const sizeMaster = mastersRef.current.get(slide) ?? null;
          check(
            await generateCard(
              target,
              slide,
              size,
              sizeMaster ? { sizeMaster } : { styleAnchor: slide > 1 ? anchor : null },
              controller.signal,
            ),
          );
        },
        halted,
      );
    }

    setJobs((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([k, job]) => [k, job.status === "queued" ? { status: "error", error: "Dibatalkan." } : job]),
      ),
    );
    setNotices(runNotices);
    setRunning(false);
    runAbort.current = null;
  }

  async function retryCard(slide: number, size: MetaAdSize) {
    if (!approved || running || !validateKey()) return;
    const master = approved.sizes[0];
    const controller = new AbortController();
    if (size.id === master.id) {
      const anchor = useAnchor && slide > 1 ? (mastersRef.current.get(1) ?? null) : null;
      const r = await generateCard(approved.draft, slide, size, { styleAnchor: anchor }, controller.signal);
      if (r.ok) await rememberMaster(slide, r.blob);
    } else {
      const sizeMaster = mastersRef.current.get(slide) ?? null;
      await generateCard(approved.draft, slide, size, { sizeMaster }, controller.signal);
    }
  }

  const fileName = (slide: number, size: MetaAdSize) =>
    `card-${String(slide).padStart(2, "0")}-${size.exportSize.width}x${size.exportSize.height}.png`;

  async function downloadCard(slide: number, size: MetaAdSize) {
    const blob = jobs[key(slide, size.id)]?.blob;
    if (!blob) return;
    const exact = await exportExactSize(blob, size.exportSize.width, size.exportSize.height);
    downloadBlob(exact, `intelligo-meta-${fileTimestamp()}-${fileName(slide, size)}`);
  }

  async function downloadAll() {
    if (!approved) return;
    const entries = [];
    for (const size of approved.sizes) {
      for (let slide = 1; slide <= approved.draft.slides.length; slide++) {
        const blob = jobs[key(slide, size.id)]?.blob;
        if (!blob) continue;
        const exact = await exportExactSize(blob, size.exportSize.width, size.exportSize.height);
        entries.push({
          name: `${size.exportSize.width}x${size.exportSize.height}/${fileName(slide, size)}`,
          data: new Uint8Array(await exact.arrayBuffer()),
        });
      }
    }
    if (entries.length === 0) return;
    downloadBlob(new Blob([createZip(entries)], { type: "application/zip" }), `intelligo-meta-ads-${fileTimestamp()}.zip`);
  }

  function openViewer(slide: number, size: MetaAdSize) {
    setViewing({ slide, size });
    requestAnimationFrame(() => dialogRef.current?.showModal());
  }

  const doneCount = Object.values(jobs).filter((j) => j.status === "done").length;
  const failedCount = Object.values(jobs).filter((j) => j.status === "error").length;
  const jobTotal = Object.keys(jobs).length;
  const viewingJob = viewing ? jobs[key(viewing.slide, viewing.size.id)] : undefined;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,38fr)_minmax(0,62fr)]">
      <form
        className="panel space-y-6 p-5 sm:p-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          splitPaste();
        }}
      >
        {controls}

        <fieldset>
          <legend className="label">Ukuran Meta Ads</legend>
          <div className="grid gap-2">
            {META_AD_SIZES.map((size) => (
              <label
                key={size.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  selected.includes(size.id) ? "border-navy bg-pale/60" : "border-line bg-white hover:border-navy-400"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(size.id)}
                  onChange={(e) =>
                    setSelected((prev) => (e.target.checked ? [...prev, size.id] : prev.filter((id) => id !== size.id)))
                  }
                  disabled={running}
                  className="h-4 w-4 accent-navy"
                />
                <span
                  aria-hidden="true"
                  className="inline-block shrink-0 rounded-sm border-2 border-navy"
                  style={{ width: 14, height: (14 * size.exportSize.height) / size.exportSize.width }}
                />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold text-navy">
                    {size.exportSize.width}×{size.exportSize.height}
                  </span>{" "}
                  <span className="text-muted">
                    · {size.ratio} · {size.placement}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {sizes.length === 0 && <p className="mt-1.5 text-sm text-danger">Pilih minimal satu ukuran.</p>}
          {sizes.length > 1 && (
            <p className="mt-1.5 text-xs text-muted">
              {sizes[0].ratio} dibuat dulu sebagai master, lalu ukuran lain diadaptasi dari desain yang sama.
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor={pasteId} className="label">
            Tempel prompt dari ChatGPT
          </label>
          <textarea
            id={pasteId}
            value={paste}
            onChange={(e) => {
              setPaste(e.target.value);
              if (pasteError) setPasteError(null);
            }}
            rows={10}
            placeholder={EXAMPLE}
            aria-invalid={pasteError ? true : undefined}
            className="field min-h-56 resize-y font-mono text-[13px] leading-relaxed"
          />
          {pasteError && (
            <p role="alert" className="mt-1.5 text-sm text-danger">
              {pasteError}
            </p>
          )}
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Pisahkan tiap kartu dengan &ldquo;Slide 1:&rdquo;, &ldquo;Slide 2:&rdquo;, dst. Teks sebelum Slide 1 berlaku untuk semua slide.
            Tanpa penanda = 1 gambar. Teks dalam tanda kutip ditulis persis.
            {paste.trim() && (
              <span className="mt-1 block font-semibold text-navy">
                Terdeteksi {livePreview.slides.length} slide{livePreview.shared ? " + arahan umum" : ""}.
              </span>
            )}
          </p>
          <button type="button" onClick={() => setPaste(EXAMPLE)} className="mt-2 text-xs font-semibold text-navy-600 hover:text-navy">
            Isi contoh
          </button>
        </div>

        <label className="flex items-start gap-2 text-sm text-navy">
          <input
            type="checkbox"
            checked={useAnchor}
            onChange={(e) => setUseAnchor(e.target.checked)}
            disabled={running}
            className="mt-0.5 h-4 w-4 shrink-0 accent-navy"
          />
          <span>
            Konsistensi gaya antar slide
            <span className="block text-xs text-muted">Slide 1 dibuat dulu, lalu jadi referensi gaya slide lain.</span>
          </span>
        </label>

        <button
          type="submit"
          disabled={running}
          className="btn h-14 w-full bg-orange text-[19px] font-bold tracking-[0.06em] text-white hover:bg-orange-hover disabled:opacity-80"
        >
          {draft ? "PISAHKAN ULANG" : "PISAHKAN & REVIEW"}
        </button>
      </form>

      <div className="space-y-6">
        {error && (
          <div role="alert" className="rounded-lg border border-danger/20 bg-danger-bg px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {!draft && (
          <section className="panel flex min-h-[420px] items-center justify-center p-8 text-center">
            <div>
              <span aria-hidden="true" className="mx-auto mb-5 block h-px w-10 bg-orange" />
              <p className="text-sm font-semibold tracking-[0.14em] text-navy uppercase">Meta Ads Carousel</p>
              <p className="mt-2 text-sm text-muted">Tempel prompt final dari ChatGPT, lalu klik Pisahkan &amp; Review.</p>
              <p className="mt-1 text-xs text-muted">Output persis 1080×1080, 1080×1350, dan 1080×1920 untuk Ads Manager.</p>
            </div>
          </section>
        )}

        {draft && view === "review" && (
          <section aria-labelledby="meta-review-heading" className="panel overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <p className="eyebrow">Meta Ads · Review</p>
              <h3 id="meta-review-heading" className="mt-0.5 text-lg font-semibold tracking-tight text-navy uppercase">
                Cek prompt tiap slide
              </h3>
              <p className="mt-1 text-xs text-muted">
                Prompt kamu jadi arahan utama; brand engine Intelligo melengkapi sisanya (palet, gaya, aturan logo &amp; fakta).
              </p>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label htmlFor={`${pasteId}-shared`} className="mb-1 block text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  Arahan umum (berlaku untuk semua slide)
                </label>
                <textarea
                  id={`${pasteId}-shared`}
                  value={draft.shared}
                  onChange={(e) => setDraft({ ...draft, shared: e.target.value })}
                  rows={3}
                  placeholder="(kosong)"
                  className="field resize-y text-sm leading-relaxed"
                />
              </div>

              <ol className="space-y-3">
                {draft.slides.map((text, i) => (
                  <li key={i} className="rounded-xl border border-line bg-white p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold tracking-[0.12em] text-navy uppercase">
                        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-navy text-[11px] text-white">
                          {i + 1}
                        </span>
                        Slide {i + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, slides: draft.slides.filter((_, j) => j !== i) })}
                        disabled={draft.slides.length <= 1}
                        className="text-xs font-semibold text-muted hover:text-danger disabled:opacity-40"
                        aria-label={`Hapus slide ${i + 1}`}
                      >
                        Hapus
                      </button>
                    </div>
                    <textarea
                      value={text}
                      onChange={(e) => updateSlide(i, e.target.value)}
                      rows={4}
                      aria-label={`Prompt slide ${i + 1}`}
                      className="field resize-y text-sm leading-relaxed"
                    />
                    {text.trim().length < META_ADS_LIMITS.minSlideLength && (
                      <p className="mt-1 text-xs text-danger">Prompt slide masih kosong.</p>
                    )}
                    {devMode && sizes[0] && (
                      <div className="mt-3 border-t border-line pt-3">
                        <PromptPreview key={`${text}|${sizes[0].id}`} load={() => loadPrompt(i + 1, sizes[0])} />
                      </div>
                    )}
                  </li>
                ))}
              </ol>

              <button
                type="button"
                onClick={() => setDraft({ ...draft, slides: [...draft.slides, ""] })}
                disabled={draft.slides.length >= META_ADS_LIMITS.maxSlides}
                className="btn-secondary w-full"
              >
                + Tambah slide
              </button>

              <div className="border-t border-line pt-4">
                {tooMany && (
                  <p role="alert" className="mb-2 text-sm text-danger">
                    Meta carousel maksimal {META_ADS_LIMITS.maxSlides} kartu. Hapus {slideCount - META_ADS_LIMITS.maxSlides} slide.
                  </p>
                )}
                <p className="mb-3 text-sm text-navy">
                  {slideCount} slide × {sizes.length} ukuran = <span className="font-semibold">{total} gambar</span>
                  <span className="text-muted"> ({sizes.map((s) => s.ratio).join(", ") || "belum ada ukuran"})</span>
                </p>
                <button
                  type="button"
                  onClick={() => void generateAll()}
                  disabled={running || tooMany || emptySlide || sizes.length === 0}
                  className="btn h-14 w-full bg-orange text-[19px] font-bold tracking-[0.06em] text-white hover:bg-orange-hover disabled:opacity-60"
                >
                  GENERATE {total} GAMBAR
                </button>
                {approved && (
                  <button
                    type="button"
                    onClick={() => setView("results")}
                    className="mt-2 w-full text-center text-xs font-semibold text-muted hover:text-navy"
                  >
                    ← Kembali ke hasil sebelumnya (tanpa generate ulang)
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {approved && view === "results" && (
          <section aria-labelledby="meta-results-heading" className="panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="eyebrow">
                  Meta Ads · {approved.draft.slides.length} slide · {approved.sizes.length} ukuran
                </p>
                <h3 id="meta-results-heading" className="mt-0.5 text-lg font-semibold tracking-tight text-navy uppercase">
                  {running ? "Creating your ads…" : failedCount > 0 ? "Sebagian gambar gagal" : "Your ads are ready"}
                </h3>
                <p className="mt-1 text-xs text-muted" aria-live="polite">
                  {doneCount}/{jobTotal} selesai{failedCount > 0 ? ` · ${failedCount} gagal` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {running ? (
                  <button type="button" onClick={() => runAbort.current?.abort()} className="btn-secondary">
                    Cancel
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => setView("review")} className="btn-secondary">
                      Edit Prompt
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadAll()}
                      disabled={doneCount === 0}
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
                <div className="h-full bg-orange transition-all" style={{ width: `${jobTotal ? (doneCount / jobTotal) * 100 : 0}%` }} />
              </div>
              {notices.length > 0 && (
                <ul className="mb-4 space-y-1 rounded-lg bg-pale px-4 py-3 text-xs text-navy">
                  {notices.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}

              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-x-3 border-spacing-y-0 text-left">
                  <thead>
                    <tr>
                      <th scope="col" className="w-10 pb-2 text-[11px] font-semibold text-muted">
                        #
                      </th>
                      {approved.sizes.map((size, i) => (
                        <th key={size.id} scope="col" className="pb-2 text-[11px] font-semibold tracking-[0.08em] text-navy uppercase">
                          {size.exportSize.width}×{size.exportSize.height}
                          {i === 0 && approved.sizes.length > 1 && (
                            <span className="ml-1 font-normal tracking-normal text-muted normal-case">(master)</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {approved.draft.slides.map((text, i) => {
                      const slide = i + 1;
                      return (
                        <tr key={slide}>
                          <th scope="row" className="pb-4 align-top text-sm font-semibold text-navy" title={text}>
                            {slide}
                          </th>
                          {approved.sizes.map((size) => {
                            const job = jobs[key(slide, size.id)] ?? { status: "queued" };
                            return (
                              <td key={size.id} className="min-w-[120px] pb-4 align-top">
                                <div
                                  className="relative flex items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas"
                                  style={{ aspectRatio: `${size.exportSize.width} / ${size.exportSize.height}` }}
                                >
                                  {job.status === "done" && job.url ? (
                                    <button
                                      type="button"
                                      onClick={() => openViewer(slide, size)}
                                      className="h-full w-full cursor-zoom-in"
                                      aria-label={`Buka slide ${slide} ${size.ratio}`}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                                      <img src={job.url} alt={`Slide ${slide}, ${size.ratio}`} className="h-full w-full object-cover" />
                                    </button>
                                  ) : job.status === "generating" ? (
                                    <>
                                      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
                                        <div className="animate-shimmer absolute inset-y-0 -left-1/2 w-[200%] bg-gradient-to-r from-transparent via-white to-transparent" />
                                      </div>
                                      <p className="relative text-[10px] font-semibold tracking-[0.12em] text-navy uppercase">Generating…</p>
                                    </>
                                  ) : job.status === "error" ? (
                                    <div className="px-2 text-center">
                                      <p className="text-[11px] leading-snug text-danger">{job.error}</p>
                                      {!running && (
                                        <button
                                          type="button"
                                          onClick={() => void retryCard(slide, size)}
                                          className="btn-secondary mt-2 px-2.5 py-1 text-[11px]"
                                        >
                                          Retry
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-muted">Menunggu…</p>
                                  )}
                                </div>
                                {job.status === "done" && !running && (
                                  <div className="mt-1 flex gap-2 text-[11px] font-semibold">
                                    <button type="button" onClick={() => void downloadCard(slide, size)} className="text-navy-600 hover:text-navy">
                                      Download
                                    </button>
                                    <button type="button" onClick={() => void retryCard(slide, size)} className="text-navy-600 hover:text-navy">
                                      Regenerate
                                    </button>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted">
                Download memberi file persis {approved.sizes.map((s) => `${s.exportSize.width}×${s.exportSize.height}`).join(", ")} siap upload ke Ads Manager.
              </p>
            </div>

            <dialog
              ref={dialogRef}
              aria-label="Fullscreen preview"
              onClose={() => setViewing(null)}
              onClick={(e) => {
                if (e.target === e.currentTarget) dialogRef.current?.close();
              }}
              className="m-auto max-h-none max-w-none bg-transparent p-0 backdrop:bg-navy/90"
            >
              {viewing && viewingJob?.url && (
                <div className="flex h-dvh w-dvw flex-col items-center justify-center gap-3 p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                  <img
                    src={viewingJob.url}
                    alt={`Slide ${viewing.slide}, ${viewing.size.ratio}`}
                    className="max-h-[calc(100dvh-5rem)] max-w-full rounded-lg object-contain"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void downloadCard(viewing.slide, viewing.size)}
                      className="btn bg-white text-navy hover:bg-pale"
                    >
                      Download {viewing.size.exportSize.width}×{viewing.size.exportSize.height}
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
              )}
            </dialog>
          </section>
        )}

        {footer}
      </div>
    </div>
  );
}
