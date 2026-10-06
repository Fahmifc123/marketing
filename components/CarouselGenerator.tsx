"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import CarouselPlanReview from "@/components/CarouselPlanReview";
import CarouselSlideGrid, { type SlideJob } from "@/components/CarouselSlideGrid";
import type { ReferenceImage } from "@/components/ReferenceUploader";
import { CAROUSEL_LIMITS, detectSlideCount } from "@/lib/carousel";
import { verifyCarouselPlan } from "@/lib/carousel-verifier";
import {
  base64ToBlob,
  createThumbnail,
  downloadBlob,
  extensionFor,
  fileTimestamp,
  prepareStyleAnchor,
} from "@/lib/client-image";
import { PROMPT_LIMITS, isValidCustomRatio, resolveFormat } from "@/lib/image-settings";
import { runPool } from "@/lib/pool";
import { createZip } from "@/lib/zip";
import type { CarouselPlan, CarouselPlanResponse } from "@/types/carousel";
import type { GenerateResponse, GenerationSettings as Settings } from "@/types/generation";
import type { HistoryItem } from "@/types/image";

interface Props {
  apiKey: string;
  settings: Settings;
  reference: ReferenceImage | null;
  devMode: boolean;
  /** Shared API key / model / quality / format / reference controls. */
  controls: ReactNode;
  onApiKeyError: (message: string) => void;
  onSaveToHistory: (item: HistoryItem) => Promise<void>;
  footer?: ReactNode;
}

type Phase = "idle" | "planning" | "review" | "slides";
type SlideResult = { ok: true; blob: Blob } | { ok: false; code: string; message: string };

/** Errors that will fail every other slide too — stop the run instead of burning requests. */
const FATAL_CODES = new Set(["unauthorized", "invalid_api_key", "missing_api_key", "insufficient_quota", "permission_denied"]);

const EXAMPLES = [
  "Carousel 6 slide: kenapa karyawan perlu belajar AI tools untuk kerja lebih produktif",
  "Carousel edukasi 5 slide: dasar Python untuk analisis data",
  "Carousel 8 slide promo Bootcamp Data Science untuk fresh graduate",
];

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function CarouselGenerator({
  apiKey,
  settings,
  reference,
  devMode,
  controls,
  onApiKeyError,
  onSaveToHistory,
  footer,
}: Props) {
  const briefId = useId();
  const countId = useId();
  const [brief, setBrief] = useState("");
  const [slideCount, setSlideCount] = useState<"auto" | number>("auto");
  const [useAnchor, setUseAnchor] = useState(true);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [planMeta, setPlanMeta] = useState<Omit<CarouselPlanResponse, "ok" | "plan" | "issues"> | null>(null);
  const [plan, setPlan] = useState<CarouselPlan | null>(null);
  /** The brief the plan was made from (the textarea may change afterwards). */
  const [planBrief, setPlanBrief] = useState("");

  const [approvedPlan, setApprovedPlan] = useState<CarouselPlan | null>(null);
  const [anchorUsed, setAnchorUsed] = useState(false);
  const [jobs, setJobs] = useState<Record<number, SlideJob>>({});
  const [running, setRunning] = useState(false);
  const [runNotices, setRunNotices] = useState<string[]>([]);

  const planAbort = useRef<AbortController | null>(null);
  const runAbort = useRef<AbortController | null>(null);
  const anchorRef = useRef<File | null>(null);
  const groupIdRef = useRef<string>("");
  const urlsRef = useRef<Map<number, string>>(new Map());

  const resolvedFormat = resolveFormat({
    formatId: settings.formatId,
    customRatio: isValidCustomRatio(settings.customRatio) ? settings.customRatio : undefined,
  });
  const issues = plan ? verifyCarouselPlan(plan, planBrief) : [];
  const detectedCount = detectSlideCount(brief);

  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      planAbort.current?.abort();
      runAbort.current?.abort();
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  function validateInputs(): boolean {
    const key = apiKey.trim();
    if (!key) {
      onApiKeyError("Masukkan OpenAI API key terlebih dahulu.");
      return false;
    }
    if (!/^sk-\S{16,}$/.test(key)) {
      onApiKeyError("API key tidak valid. Periksa kembali API key kamu.");
      return false;
    }
    if (settings.formatId === "custom" && !isValidCustomRatio(settings.customRatio)) {
      setError("Rasio custom harus antara 1:3 dan 3:1.");
      return false;
    }
    return true;
  }

  // ---------- 1. Plan (main agent + verifier) ----------

  async function requestPlan() {
    if (brief.trim().length < PROMPT_LIMITS.minLength) {
      setBriefError("Tulis dulu carousel apa yang ingin kamu buat.");
      return;
    }
    setBriefError(null);
    if (!validateInputs() || running) return;

    planAbort.current?.abort();
    const controller = new AbortController();
    planAbort.current = controller;
    setError(null);
    setPhase("planning");

    try {
      const res = await fetch("/api/carousel/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          brief: brief.trim(),
          slideCount,
          model: settings.model,
          quality: settings.quality,
          formatId: settings.formatId,
          customRatio: settings.customRatio,
          hasReference: Boolean(reference),
        }),
      });
      const data = (await res.json()) as CarouselPlanResponse | { ok: false; error: { code: string; message: string } };
      if (!data.ok) {
        if (data.error.code === "unauthorized") {
          window.location.replace("/login");
          return;
        }
        if (data.error.code === "invalid_api_key") onApiKeyError(data.error.message);
        throw new Error(data.error.message);
      }
      // Issues are re-computed live from the (editable) plan with the same verifier.
      setPlan(data.plan);
      setPlanBrief(brief.trim());
      setPlanMeta({
        source: data.source,
        plannerModel: data.plannerModel,
        revisions: data.revisions,
        notices: data.notices,
      });
      setPhase("review");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error && err.message ? err.message : "Gagal membuat rencana carousel. Coba lagi.");
      setPhase(plan ? "review" : "idle");
    }
  }

  async function loadSlidePrompt(index: number): Promise<string> {
    if (!plan) throw new Error("No plan");
    const res = await fetch("/api/carousel/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief: planBrief,
        plan,
        slideIndex: index,
        model: settings.model,
        quality: settings.quality,
        formatId: settings.formatId,
        customRatio: settings.customRatio,
        useStyleAnchor: useAnchor,
        hasReference: Boolean(reference),
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error?.message ?? "Failed");
    return data.prompt as string;
  }

  // ---------- 2. Generate (cover first, then parallel) ----------

  function setJob(index: number, job: SlideJob) {
    const old = urlsRef.current.get(index);
    if (job.url !== old && old) {
      URL.revokeObjectURL(old);
      urlsRef.current.delete(index);
    }
    if (job.url) urlsRef.current.set(index, job.url);
    setJobs((prev) => ({ ...prev, [index]: job }));
  }

  async function generateSlide(
    target: CarouselPlan,
    index: number,
    anchor: File | null,
    signal: AbortSignal,
  ): Promise<SlideResult> {
    setJob(index, { status: "generating" });
    const slide = target.slides[index - 1];

    const form = new FormData();
    form.set("apiKey", apiKey.trim());
    form.set("prompt", planBrief);
    form.set("model", settings.model);
    form.set("quality", settings.quality);
    form.set("formatId", settings.formatId);
    form.set("formatExplicit", "true");
    if (settings.formatId === "custom") {
      form.set("customWidth", String(settings.customRatio.width));
      form.set("customHeight", String(settings.customRatio.height));
    }
    form.set("carousel", JSON.stringify({ plan: target, slideIndex: index }));
    if (anchor && index > 1) form.set("styleAnchor", anchor, anchor.name);
    if (reference) form.set("referenceImage", reference.file, reference.file.name);
    form.set("developerMode", String(devMode));

    try {
      const res = await fetch("/api/generate", { method: "POST", body: form, signal });
      let data: GenerateResponse;
      try {
        data = (await res.json()) as GenerateResponse;
      } catch {
        throw Object.assign(new Error("Generation gagal. Coba lagi."), { code: "generation_failed" });
      }
      if (!data.ok) {
        if (data.error.code === "unauthorized") window.location.replace("/login");
        if (data.error.code === "invalid_api_key") onApiKeyError(data.error.message);
        setJob(index, { status: "error", error: data.error.message });
        return { ok: false, code: data.error.code, message: data.error.message };
      }

      const blob = base64ToBlob(data.image.b64, data.image.mimeType);
      setJob(index, { status: "done", blob, url: URL.createObjectURL(blob) });

      try {
        const { meta } = data;
        await onSaveToHistory({
          id: newId(),
          createdAt: meta.createdAt,
          prompt: planBrief,
          model: meta.model,
          modelLabel: meta.modelLabel,
          quality: meta.quality,
          formatId: meta.format.id,
          formatLabel: meta.format.label,
          aspectRatio: meta.format.ratio,
          size: meta.size,
          customRatio: meta.format.id === "custom" ? settings.customRatio : undefined,
          mimeType: data.image.mimeType,
          image: blob,
          thumbnail: await createThumbnail(blob),
          carousel: { groupId: groupIdRef.current, index, total: target.slides.length, role: slide.role },
        });
      } catch {
        // History is a convenience only.
      }
      return { ok: true, blob };
    } catch (err) {
      const aborted = (err as Error).name === "AbortError";
      const message = aborted ? "Dibatalkan." : (err as Error).message || "Generation gagal. Coba lagi.";
      setJob(index, { status: "error", error: message });
      return { ok: false, code: aborted ? "aborted" : "generation_failed", message };
    }
  }

  async function setAnchorFrom(blob: Blob): Promise<boolean> {
    try {
      anchorRef.current = await prepareStyleAnchor(blob, CAROUSEL_LIMITS.anchorMaxEdge);
      return true;
    } catch {
      anchorRef.current = null;
      return false;
    }
  }

  async function approveAndGenerate() {
    if (!plan || running || !validateInputs()) return;
    const target = plan;
    const controller = new AbortController();
    runAbort.current = controller;
    groupIdRef.current = newId();
    anchorRef.current = null;

    const withAnchor = useAnchor && target.slides.length > 1;
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current.clear();
    setJobs(Object.fromEntries(target.slides.map((s) => [s.index, { status: "queued" } satisfies SlideJob])));
    setApprovedPlan(target);
    setAnchorUsed(withAnchor);
    setRunNotices([]);
    setRunning(true);
    setPhase("slides");
    setError(null);

    let stopped = false;
    const notices: string[] = [];
    const check = (r: SlideResult) => {
      if (!r.ok && FATAL_CODES.has(r.code) && !stopped) {
        stopped = true;
        notices.push(`Generate dihentikan: ${r.message}`);
      }
    };

    const queue = target.slides.map((s) => s.index);
    if (withAnchor) {
      // The cover is generated first and becomes the style reference for every other slide.
      const cover = await generateSlide(target, 1, null, controller.signal);
      check(cover);
      queue.shift();
      if (cover.ok) {
        if (!(await setAnchorFrom(cover.blob))) notices.push("Style anchor gagal disiapkan — slide lain dibuat tanpa referensi cover.");
      } else if (!stopped && !controller.signal.aborted) {
        notices.push("Cover gagal — slide lain tetap dibuat dengan style guide yang sama, tanpa referensi cover.");
      }
    }

    if (!stopped && !controller.signal.aborted) {
      await runPool(
        queue,
        CAROUSEL_LIMITS.concurrency,
        async (index) => check(await generateSlide(target, index, anchorRef.current, controller.signal)),
        () => stopped || controller.signal.aborted,
      );
    }

    setJobs((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([k, job]) => [k, job.status === "queued" ? { status: "error", error: "Dibatalkan." } : job]),
      ),
    );
    setRunNotices(notices);
    setRunning(false);
    runAbort.current = null;
  }

  async function retrySlide(index: number) {
    if (!approvedPlan || running || !validateInputs()) return;
    const controller = new AbortController();
    const result = await generateSlide(approvedPlan, index, anchorUsed ? anchorRef.current : null, controller.signal);
    // A regenerated cover becomes the new style anchor for later retries.
    if (index === 1 && anchorUsed && result.ok) await setAnchorFrom(result.blob);
  }

  function downloadSlide(index: number) {
    const job = jobs[index];
    const slide = approvedPlan?.slides[index - 1];
    if (!job?.blob || !slide) return;
    downloadBlob(
      job.blob,
      `intelligo-carousel-${fileTimestamp()}-${String(index).padStart(2, "0")}-${slug(slide.role)}.${extensionFor(job.blob.type)}`,
    );
  }

  async function downloadAll() {
    if (!approvedPlan) return;
    const entries = [];
    for (const slide of approvedPlan.slides) {
      const blob = jobs[slide.index]?.blob;
      if (!blob) continue;
      entries.push({
        name: `${String(slide.index).padStart(2, "0")}-${slug(slide.role)}.${extensionFor(blob.type)}`,
        data: new Uint8Array(await blob.arrayBuffer()),
      });
    }
    if (entries.length === 0) return;
    downloadBlob(new Blob([createZip(entries)], { type: "application/zip" }), `intelligo-carousel-${fileTimestamp()}.zip`);
  }

  const planning = phase === "planning";
  const busy = planning || running;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,38fr)_minmax(0,62fr)]">
      <form
        className="panel space-y-6 p-5 sm:p-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void requestPlan();
        }}
      >
        {controls}

        <div>
          <label htmlFor={briefId} className="label">
            Carousel apa yang ingin dibuat?
          </label>
          <textarea
            id={briefId}
            value={brief}
            onChange={(e) => {
              setBrief(e.target.value);
              if (briefError) setBriefError(null);
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void requestPlan();
              }
            }}
            rows={5}
            maxLength={PROMPT_LIMITS.maxLength}
            placeholder="Contoh: Carousel 6 slide tentang kenapa karyawan perlu belajar AI tools, ajak ikut Bootcamp AI Tools."
            aria-invalid={briefError ? true : undefined}
            className="field min-h-32 resize-y leading-relaxed"
          />
          {briefError && (
            <p role="alert" className="mt-1.5 text-sm text-danger">
              {briefError}
            </p>
          )}
          <p className="mt-1.5 text-xs text-muted">
            Agent akan menyusun alur cerita, copy & style guide, lalu memverifikasi tiap slide. Kamu review dulu sebelum generate.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setBrief(ex)}
                disabled={busy}
                className="rounded-full border border-line bg-white px-3 py-1.5 text-left text-xs font-medium text-navy hover:border-navy-400 hover:bg-pale disabled:opacity-50"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={countId} className="label">
              Jumlah slide
            </label>
            <select
              id={countId}
              value={String(slideCount)}
              onChange={(e) => setSlideCount(e.target.value === "auto" ? "auto" : Number(e.target.value))}
              disabled={busy}
              className="select"
            >
              <option value="auto">
                Auto ({detectedCount ?? CAROUSEL_LIMITS.defaultSlides} slide)
              </option>
              {Array.from({ length: CAROUSEL_LIMITS.maxSlides - CAROUSEL_LIMITS.minSlides + 1 }, (_, i) => i + CAROUSEL_LIMITS.minSlides).map(
                (n) => (
                  <option key={n} value={n}>
                    {n} slide
                  </option>
                ),
              )}
            </select>
          </div>
          <label className="flex items-start gap-2 self-end pb-1 text-sm text-navy">
            <input
              type="checkbox"
              checked={useAnchor}
              onChange={(e) => setUseAnchor(e.target.checked)}
              disabled={busy}
              className="mt-0.5 h-4 w-4 shrink-0 accent-navy"
            />
            <span>
              Konsistensi gaya
              <span className="block text-xs text-muted">Cover dibuat dulu, lalu jadi referensi slide lain.</span>
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="btn h-14 w-full bg-orange text-[19px] font-bold tracking-[0.06em] text-white hover:bg-orange-hover disabled:opacity-80"
        >
          {planning ? "PLANNING…" : plan ? "RE-PLAN CAROUSEL" : "PLAN CAROUSEL"}
        </button>
      </form>

      <div className="space-y-6">
        {error && (
          <div role="alert" className="rounded-lg border border-danger/20 bg-danger-bg px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {phase === "idle" && (
          <section className="panel flex min-h-[420px] items-center justify-center p-8 text-center">
            <div>
              <span aria-hidden="true" className="mx-auto mb-5 block h-px w-10 bg-orange" />
              <p className="text-sm font-semibold tracking-[0.14em] text-navy uppercase">Your carousel space</p>
              <p className="mt-2 text-sm text-muted">Tulis brief, lalu klik Plan Carousel.</p>
              <p className="mt-1 text-xs text-muted">Plan → verifikasi → review → generate paralel.</p>
            </div>
          </section>
        )}

        {planning && (
          <section aria-live="polite" aria-busy="true" className="panel relative flex min-h-[420px] items-center justify-center overflow-hidden p-8 text-center">
            <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
              <div className="animate-shimmer absolute inset-y-0 -left-1/2 w-[200%] bg-gradient-to-r from-transparent via-pale/80 to-transparent" />
            </div>
            <div className="relative">
              <span aria-hidden="true" className="animate-breathe mx-auto mb-5 block h-2.5 w-2.5 rounded-full bg-orange" />
              <p className="text-sm font-semibold tracking-[0.14em] text-navy uppercase">Planning your carousel…</p>
              <p className="mt-2 text-sm text-muted">Agent menyusun alur cerita & memverifikasi tiap slide.</p>
            </div>
          </section>
        )}

        {phase === "slides" && approvedPlan && (
          <CarouselSlideGrid
            slides={approvedPlan.slides}
            jobs={jobs}
            frame={resolvedFormat.generationSize}
            running={running}
            usesStyleAnchor={anchorUsed}
            notices={runNotices}
            onRetry={(i) => void retrySlide(i)}
            onDownload={downloadSlide}
            onDownloadAll={() => void downloadAll()}
            onCancel={() => runAbort.current?.abort()}
            onEditPlan={() => setPhase("review")}
          />
        )}

        {phase === "review" && plan && planMeta && (
          <CarouselPlanReview
            plan={plan}
            issues={issues}
            source={planMeta.source}
            plannerModel={planMeta.plannerModel}
            revisions={planMeta.revisions}
            notices={planMeta.notices}
            devMode={devMode}
            disabled={busy}
            onChange={setPlan}
            onApprove={() => void approveAndGenerate()}
            onBackToResults={approvedPlan ? () => setPhase("slides") : undefined}
            loadSlidePrompt={loadSlidePrompt}
          />
        )}

        {footer}
      </div>
    </div>
  );
}
