"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import CarouselGenerator from "@/components/CarouselGenerator";
import DeveloperMode from "@/components/DeveloperMode";
import GenerationSettings from "@/components/GenerationSettings";
import HistoryPanel from "@/components/HistoryPanel";
import ImagePreview, { type PreviewStatus } from "@/components/ImagePreview";
import PromptInput from "@/components/PromptInput";
import ReferenceUploader, { type ReferenceImage } from "@/components/ReferenceUploader";
import { base64ToBlob, copyText, createThumbnail, downloadBlob } from "@/lib/client-image";
import { isStoryPrompt } from "@/lib/content-detection";
import { addHistoryItem, deleteHistoryItem, listHistory } from "@/lib/history-store";
import {
  DEFAULT_CUSTOM_RATIO,
  DEFAULT_FORMAT,
  DEFAULT_MODEL,
  DEFAULT_QUALITY,
  PROMPT_LIMITS,
  getModel,
  isValidCustomRatio,
  resolveFormat,
} from "@/lib/image-settings";
import type {
  CreativeResult,
  GenerateResponse,
  GenerationMeta,
  GenerationSettings as Settings,
  PromptPreviewResponse,
} from "@/types/generation";
import type { HistoryItem } from "@/types/image";

interface GenerationRequest {
  prompt: string;
  settings: Settings;
  reference: ReferenceImage | null;
  override: string | null;
}

const INITIAL_SETTINGS: Settings = {
  model: DEFAULT_MODEL,
  quality: DEFAULT_QUALITY,
  formatId: DEFAULT_FORMAT,
  customRatio: DEFAULT_CUSTOM_RATIO,
  formatExplicit: false,
};

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function ImageGenerator() {
  // The API key lives only in this component's memory. It is never persisted.
  const [apiKey, setApiKey] = useState("");
  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS);
  const [prompt, setPrompt] = useState("");
  const [reference, setReference] = useState<ReferenceImage | null>(null);

  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ apiKey?: string; prompt?: string }>({});
  const [result, setResult] = useState<CreativeResult | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyAvailable, setHistoryAvailable] = useState(true);

  const [mode, setMode] = useState<"single" | "carousel">("single");
  const [devMode, setDevMode] = useState(false);
  const [override, setOverride] = useState<string | null>(null);
  const [lastMeta, setLastMeta] = useState<GenerationMeta | null>(null);
  const [preview, setPreview] = useState<{ prompt: string | null; loading: boolean; error: string | null }>({
    prompt: null,
    loading: false,
    error: null,
  });

  const apiKeyRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastRequest = useRef<GenerationRequest | null>(null);
  const resultUrl = useRef<string | null>(null);

  const loading = status === "loading";
  const autoStory = isStoryPrompt(prompt);
  const resolvedFormat = resolveFormat({
    formatId: settings.formatId,
    customRatio: isValidCustomRatio(settings.customRatio) ? settings.customRatio : undefined,
    autoStory: autoStory && !settings.formatExplicit,
  });

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await listHistory());
    } catch {
      setHistoryAvailable(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listHistory()
      .then((items) => !cancelled && setHistory(items))
      .catch(() => !cancelled && setHistoryAvailable(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Release object URLs and cancel requests on unmount.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    },
    [],
  );

  // Developer Mode: live preview of the internal prompt (built server-side).
  const hasReference = Boolean(reference);
  const previewable = mode === "single" && devMode && prompt.trim().length >= PROMPT_LIMITS.minLength;
  useEffect(() => {
    if (!previewable) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreview((p) => ({ ...p, loading: true, error: null }));
      try {
        const res = await fetch("/api/prompt-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            prompt,
            model: settings.model,
            quality: settings.quality,
            formatId: settings.formatId,
            customRatio: settings.customRatio,
            formatExplicit: settings.formatExplicit,
            hasReference,
          }),
        });
        const data = (await res.json()) as PromptPreviewResponse | { ok: false; error: { message: string } };
        if (data.ok) setPreview({ prompt: data.prompt, loading: false, error: null });
        else setPreview({ prompt: null, loading: false, error: data.error.message });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setPreview({ prompt: null, loading: false, error: "Gagal memuat prompt." });
        }
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [previewable, prompt, settings, hasReference]);

  function showResult(next: CreativeResult) {
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    resultUrl.current = next.url;
    setResult(next);
  }

  async function generate(request: GenerationRequest) {
    if (inFlight.current) return;

    const errors: typeof fieldErrors = {};
    const key = apiKey.trim();
    if (!key) errors.apiKey = "Masukkan OpenAI API key terlebih dahulu.";
    else if (!/^sk-\S{16,}$/.test(key)) errors.apiKey = "API key tidak valid. Periksa kembali API key kamu.";
    if (request.prompt.trim().length < PROMPT_LIMITS.minLength) errors.prompt = "Tulis dulu apa yang ingin kamu buat.";
    setFieldErrors(errors);
    if (errors.apiKey) {
      apiKeyRef.current?.focus();
      return;
    }
    if (errors.prompt) {
      promptRef.current?.focus();
      return;
    }
    if (request.settings.formatId === "custom" && !isValidCustomRatio(request.settings.customRatio)) {
      setError("Rasio custom harus antara 1:3 dan 3:1.");
      return;
    }

    inFlight.current = true;
    lastRequest.current = request;
    setStatus("loading");
    setError(null);

    const form = new FormData();
    form.set("apiKey", key);
    form.set("prompt", request.prompt.trim());
    form.set("model", request.settings.model);
    form.set("quality", request.settings.quality);
    form.set("formatId", request.settings.formatId);
    form.set("formatExplicit", String(request.settings.formatExplicit));
    if (request.settings.formatId === "custom") {
      form.set("customWidth", String(request.settings.customRatio.width));
      form.set("customHeight", String(request.settings.customRatio.height));
    }
    if (request.reference) form.set("referenceImage", request.reference.file, request.reference.file.name);
    form.set("developerMode", String(devMode));
    if (devMode && request.override !== null) form.set("promptOverride", request.override);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/generate", { method: "POST", body: form, signal: controller.signal });
      let data: GenerateResponse;
      try {
        data = (await res.json()) as GenerateResponse;
      } catch {
        throw new Error(res.status === 413 ? "Gambar referensi terlalu besar." : "Generation gagal. Coba lagi.");
      }

      if (!data.ok) {
        if (data.error.code === "unauthorized") {
          // Full navigation also clears the in-memory API key.
          window.location.replace("/login");
          return;
        }
        if (data.error.code === "invalid_api_key" || data.error.code === "missing_api_key") {
          setFieldErrors({ apiKey: data.error.message });
        }
        throw new Error(data.error.message);
      }

      const blob = base64ToBlob(data.image.b64, data.image.mimeType);
      const { meta } = data;
      const item: CreativeResult = {
        id: newId(),
        url: URL.createObjectURL(blob),
        blob,
        mimeType: data.image.mimeType,
        prompt: request.prompt.trim(),
        settings: { ...request.settings, formatId: meta.format.id, formatExplicit: true },
        modelLabel: meta.modelLabel,
        quality: meta.quality,
        formatLabel: meta.format.label,
        aspectRatio: meta.format.ratio,
        size: meta.size,
        createdAt: meta.createdAt,
        meta,
        internalPrompt: data.internalPrompt,
      };
      showResult(item);
      setLastMeta(meta);
      setStatus("success");

      try {
        await addHistoryItem({
          id: item.id,
          createdAt: item.createdAt,
          prompt: item.prompt,
          model: meta.model,
          modelLabel: meta.modelLabel,
          quality: meta.quality,
          formatId: meta.format.id,
          formatLabel: meta.format.label,
          aspectRatio: meta.format.ratio,
          size: meta.size,
          customRatio: meta.format.id === "custom" ? request.settings.customRatio : undefined,
          mimeType: item.mimeType,
          image: blob,
          thumbnail: await createThumbnail(blob),
        });
        await refreshHistory();
      } catch {
        // History is a convenience; generation still succeeded.
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStatus(result ? "success" : "idle");
        return;
      }
      setError(err instanceof Error && err.message ? err.message : "Generation gagal. Coba lagi.");
      setStatus("error");
    } finally {
      inFlight.current = false;
      abortRef.current = null;
    }
  }

  async function saveToHistory(item: HistoryItem) {
    await addHistoryItem(item);
    await refreshHistory();
  }

  function focusApiKeyError(message: string) {
    setFieldErrors((f) => ({ ...f, apiKey: message }));
    apiKeyRef.current?.focus();
  }

  function generateFromForm() {
    void generate({ prompt, settings, reference, override });
  }

  function regenerate() {
    if (lastRequest.current) {
      void generate(lastRequest.current);
    } else if (result) {
      void generate({ prompt: result.prompt, settings: result.settings, reference: null, override: null });
    }
  }

  function newCreation() {
    abortRef.current?.abort();
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    resultUrl.current = null;
    if (reference) URL.revokeObjectURL(reference.previewUrl);
    setResult(null);
    setReference(null);
    setPrompt("");
    setOverride(null);
    setError(null);
    setFieldErrors({});
    setStatus("idle");
    lastRequest.current = null;
    promptRef.current?.focus();
  }

  function historySettings(item: HistoryItem): Settings {
    return {
      model: getModel(item.model) ? item.model : DEFAULT_MODEL,
      quality: item.quality,
      formatId: item.formatId,
      customRatio: item.customRatio ?? DEFAULT_CUSTOM_RATIO,
      formatExplicit: true,
    };
  }

  function openHistory(item: HistoryItem) {
    showResult({
      id: item.id,
      url: URL.createObjectURL(item.image),
      blob: item.image,
      mimeType: item.mimeType,
      prompt: item.prompt,
      settings: historySettings(item),
      modelLabel: item.modelLabel,
      quality: item.quality,
      formatLabel: item.formatLabel,
      aspectRatio: item.aspectRatio,
      size: item.size,
      createdAt: item.createdAt,
      fromHistory: true,
    });
    lastRequest.current = null;
    setError(null);
    setStatus("success");
  }

  function regenerateHistory(item: HistoryItem) {
    const itemSettings = historySettings(item);
    setPrompt(item.prompt);
    setSettings(itemSettings);
    setOverride(null);
    void generate({ prompt: item.prompt, settings: itemSettings, reference: null, override: null });
  }

  async function removeHistory(item: HistoryItem) {
    try {
      await deleteHistoryItem(item.id);
      await refreshHistory();
    } catch {
      setHistoryAvailable(false);
    }
  }

  async function copyPrompt() {
    if (!result) return false;
    return copyText(devMode && result.internalPrompt ? result.internalPrompt : result.prompt);
  }

  const sharedControls = (
    <>
      <GenerationSettings
        ref={apiKeyRef}
        apiKey={apiKey}
        onApiKeyChange={(v) => {
          setApiKey(v);
          if (fieldErrors.apiKey) setFieldErrors((f) => ({ ...f, apiKey: undefined }));
        }}
        apiKeyError={fieldErrors.apiKey}
        settings={settings}
        onSettingsChange={setSettings}
        autoStory={mode === "single" && autoStory}
        disabled={loading}
      />
      <ReferenceUploader value={reference} onChange={setReference} disabled={loading} />
    </>
  );

  const historyPanel = (
    <HistoryPanel
      items={history}
      available={historyAvailable}
      activeId={result?.id ?? null}
      busy={loading}
      onOpen={(item) => {
        setMode("single");
        openHistory(item);
      }}
      onRegenerate={regenerateHistory}
      onDownload={(item) => downloadBlob(item.image)}
      onDelete={removeHistory}
    />
  );

  return (
    <section aria-labelledby="generator-heading">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="generator-heading" className="text-xl font-bold tracking-tight text-navy sm:text-2xl">
            AI IMAGE GENERATOR
          </h2>
          <p className="mt-1 text-sm text-muted">Turn your idea into an Intelligo ID visual.</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-navy select-none">
          <span>Developer Mode</span>
          <button
            type="button"
            role="switch"
            aria-checked={devMode}
            onClick={() => setDevMode((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${devMode ? "bg-navy" : "bg-line"}`}
          >
            <span className="sr-only">Developer Mode</span>
            <span
              aria-hidden="true"
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                devMode ? "translate-x-5" : ""
              }`}
            />
          </button>
        </label>
      </div>

      <div role="tablist" aria-label="Creation mode" className="mb-5 inline-flex rounded-lg border border-line bg-white p-1">
        {(
          [
            ["single", "Single Image"],
            ["carousel", "Carousel (multi-slide)"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            disabled={loading}
            className={`rounded-md px-4 py-2 text-xs font-semibold tracking-[0.08em] uppercase transition-colors ${
              mode === id ? "bg-navy text-white" : "text-muted hover:text-navy"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "carousel" ? (
        <CarouselGenerator
          apiKey={apiKey}
          settings={settings}
          reference={reference}
          devMode={devMode}
          controls={sharedControls}
          onApiKeyError={focusApiKeyError}
          onSaveToHistory={saveToHistory}
          footer={historyPanel}
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,38fr)_minmax(0,62fr)]">
          <div className="space-y-4">
            <form
              className="panel space-y-6 p-5 sm:p-6"
              onSubmit={(e) => {
                e.preventDefault();
                generateFromForm();
              }}
              noValidate
            >
              {sharedControls}

              <PromptInput
                ref={promptRef}
                value={prompt}
                onChange={(v) => {
                  setPrompt(v);
                  if (fieldErrors.prompt) setFieldErrors((f) => ({ ...f, prompt: undefined }));
                }}
                onSubmit={generateFromForm}
                error={fieldErrors.prompt}
                disabled={loading}
              />

              <div>
                {devMode && override !== null && (
                  <p className="mb-2 text-xs font-semibold text-navy">
                    <span aria-hidden="true" className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-orange align-middle" />
                    Manual prompt override active.
                  </p>
      )}
              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="btn h-14 w-full bg-orange text-[19px] font-bold tracking-[0.06em] text-white hover:bg-orange-hover disabled:opacity-80"
              >
                {loading ? "GENERATING…" : "GENERATE IMAGE"}
              </button>
              {loading && (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="mt-2 w-full text-center text-xs font-semibold text-muted hover:text-navy"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          {devMode && (
            <DeveloperMode
              generatedPrompt={previewable ? preview.prompt : null}
              previewLoading={preview.loading}
              previewError={previewable ? preview.error : null}
              override={override}
              onOverrideChange={setOverride}
              lastMeta={lastMeta}
              disabled={loading}
            />
          )}
        </div>

        <div>
          <ImagePreview
            status={status}
            result={result}
            error={error}
            frame={resolvedFormat.generationSize}
            onDownload={() => result && downloadBlob(result.blob)}
            onRegenerate={regenerate}
            onCopyPrompt={copyPrompt}
            onNewCreation={newCreation}
          />
          {historyPanel}
        </div>
      </div>
      )}
    </section>
  );
}
