"use client";

import { useEffect, useId, useMemo, useState } from "react";

import {
  EMAIL_LIMITS,
  EMAIL_TYPES,
  canonicalEmail,
  renderEmailHtml,
  verifyEmailDraft,
  type EmailDraft,
  type EmailIssue,
  type EmailType,
} from "@/lib/email-content";

interface Status {
  ready: boolean;
  from: string | null;
  replyTo: string | null;
}

interface Segment {
  id: string;
  name: string;
  recipients: number;
  capped: boolean;
}

type ApiError = { ok: false; error: { code: string; message: string } };

const EMPTY_DRAFT: EmailDraft = {
  subject: "",
  preheader: "",
  heading: "",
  paragraphs: [""],
  ctaLabel: "",
  closing: "Salam hangat,\nTim Intelligo ID",
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => null)) as (T & { ok: true }) | ApiError | null;
  if (!data) throw new Error("Server tidak merespons dengan benar. Coba lagi.");
  if (!data.ok) {
    if (data.error.code === "unauthorized") window.location.replace("/login");
    throw Object.assign(new Error(data.error.message), { code: data.error.code });
  }
  return data;
}

function Counter({ value, limit }: { value: string; limit: number }) {
  return (
    <span className={`text-[11px] tabular-nums ${value.length > limit ? "font-semibold text-orange-hover" : "text-muted"}`}>
      {value.length}/{limit}
    </span>
  );
}

function Issues({ issues }: { issues: EmailIssue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {issues.map((i) => (
        <li key={i.message} className={`text-xs ${i.severity === "error" ? "text-danger" : "text-navy-600"}`}>
          {i.severity === "error" ? "✕ " : "! "}
          {i.message}
        </li>
      ))}
    </ul>
  );
}

export default function EmailMarketing() {
  const id = useId();
  const [status, setStatus] = useState<Status | null>(null);

  // Brief
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [emailType, setEmailType] = useState<EmailType>("promo");
  const [brief, setBrief] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [writerMeta, setWriterMeta] = useState<{ model: string; revisions: number } | null>(null);

  // Draft
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [view, setView] = useState<"desktop" | "mobile">("desktop");

  // Test send
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ token: string; canonical: string; sentTo: string[] } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Broadcast
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [segmentsError, setSegmentsError] = useState<string | null>(null);
  const [segmentId, setSegmentId] = useState("");
  const [confirmCount, setConfirmCount] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [broadcastDone, setBroadcastDone] = useState<{ id: string; recipients: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Status & { ok: true }>("/api/email/status")
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setStatus({ ready: false, from: null, replyTo: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  const source = useMemo(() => [brief, ctaUrl].filter(Boolean).join("\n"), [brief, ctaUrl]);
  const issues = useMemo(() => (draft ? verifyEmailDraft(draft, source) : []), [draft, source]);
  const errors = issues.filter((i) => i.severity === "error");
  const issuesFor = (field: string) => issues.filter((i) => i.field === field);
  const canonical = draft ? canonicalEmail(draft, ctaUrl.trim()) : "";
  const testValid = Boolean(testResult && testResult.canonical === canonical);
  const segment = segments?.find((s) => s.id === segmentId);
  const previewHtml = useMemo(
    () => (draft ? renderEmailHtml(draft, { ctaUrl: ctaUrl.trim(), mode: "preview" }) : ""),
    [draft, ctaUrl],
  );

  function update(patch: Partial<EmailDraft>) {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
    setBroadcastDone(null);
  }

  async function generate() {
    if (!apiKey.trim()) {
      setGenError("Masukkan OpenAI API key terlebih dahulu.");
      return;
    }
    setGenerating(true);
    setGenError(null);
    try {
      const data = await api<{ draft: EmailDraft; model: string; revisions: number }>("/api/email/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), brief, emailType, ctaUrl: ctaUrl.trim() }),
      });
      setDraft(data.draft);
      setWriterMeta({ model: data.model, revisions: data.revisions });
      setBroadcastDone(null);
    } catch (err) {
      setGenError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function sendTest() {
    if (!draft) return;
    setTesting(true);
    setTestError(null);
    try {
      const to = testTo.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
      const data = await api<{ token: string; sentTo: string[] }>("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, ctaUrl: ctaUrl.trim(), to }),
      });
      setTestResult({ token: data.token, canonical, sentTo: data.sentTo });
    } catch (err) {
      setTestError((err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function loadSegments() {
    setSegmentsError(null);
    try {
      const data = await api<{ segments: Segment[] }>("/api/email/segments");
      setSegments(data.segments);
    } catch (err) {
      setSegmentsError((err as Error).message);
    }
  }

  async function broadcast() {
    if (!draft || !testResult || !segment) return;
    setBroadcasting(true);
    setBroadcastError(null);
    try {
      const data = await api<{ broadcastId: string; recipients: number }>("/api/email/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft,
          ctaUrl: ctaUrl.trim(),
          segmentId,
          testToken: testResult.token,
          confirmRecipients: Number(confirmCount),
          name: draft.subject,
        }),
      });
      setBroadcastDone({ id: data.broadcastId, recipients: data.recipients });
      setConfirmCount("");
      setAcknowledged(false);
    } catch (err) {
      setBroadcastError((err as Error).message);
      if ((err as { code?: string }).code === "confirm_mismatch") void loadSegments();
    } finally {
      setBroadcasting(false);
    }
  }

  const canBroadcast =
    Boolean(status?.ready && draft && testValid && segment && !segment.capped && segment.recipients > 0) &&
    Number(confirmCount) === segment?.recipients &&
    acknowledged &&
    errors.length === 0 &&
    !broadcasting;

  const label = "mb-1 block text-[11px] font-semibold tracking-[0.08em] text-muted uppercase";

  return (
    <div className="space-y-6">
      {status && !status.ready && (
        <div role="alert" className="rounded-lg border border-orange/30 bg-orange-100 px-4 py-3 text-sm text-navy">
          Pengiriman email belum dikonfigurasi di server. Atur <span className="font-mono">RESEND_API_KEY</span> dan{" "}
          <span className="font-mono">EMAIL_FROM</span> di Vercel, lalu redeploy. Kamu tetap bisa menulis dan preview draft.
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,42fr)_minmax(0,58fr)]">
        {/* LEFT: brief + editor */}
        <div className="space-y-6">
          <form
            className="panel space-y-5 p-5 sm:p-6"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void generate();
            }}
          >
            <p className="eyebrow">1 · Brief</p>
            <div>
              <label htmlFor={`${id}-key`} className="label">
                OpenAI API Key
              </label>
              <div className="relative">
                <input
                  id={`${id}-key`}
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-••••••••••••••••••••••••"
                  autoComplete="off"
                  spellCheck={false}
                  data-1p-ignore
                  className="field pr-20 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-pressed={showKey}
                  className="absolute inset-y-1 right-1 rounded-md px-3 text-xs font-semibold text-navy hover:bg-pale"
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-muted">Hanya untuk menulis draft. Disimpan di memori tab ini saja.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-type`} className="label">
                  Jenis email
                </label>
                <select id={`${id}-type`} value={emailType} onChange={(e) => setEmailType(e.target.value as EmailType)} className="select">
                  {EMAIL_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-cta`} className="label">
                  Link tombol CTA <span className="font-normal tracking-normal text-muted normal-case">(opsional)</span>
                </label>
                <input
                  id={`${id}-cta`}
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  placeholder="https://intelligo.id/…"
                  inputMode="url"
                  className="field"
                />
              </div>
            </div>
            <div>
              <label htmlFor={`${id}-brief`} className="label">
                Apa isi emailnya?
              </label>
              <textarea
                id={`${id}-brief`}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={6}
                maxLength={EMAIL_LIMITS.briefMax}
                placeholder="Contoh: Ajak alumni webinar AI minggu lalu ikut Bootcamp AI Tools for Work Productivity. Kelas online, cocok untuk karyawan. Sebut early bird tanpa harga."
                className="field min-h-36 resize-y leading-relaxed"
              />
              <p className="mt-1.5 text-xs text-muted">
                Tulis semua fakta yang boleh disebut (harga, tanggal, kuota). Yang tidak ada di brief tidak akan dikarang.
              </p>
            </div>
            {genError && (
              <p role="alert" className="text-sm text-danger">
                {genError}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={generating || brief.trim().length < 10}
                className="btn h-12 flex-1 bg-orange text-[17px] font-bold tracking-[0.04em] text-white hover:bg-orange-hover disabled:opacity-60"
              >
                {generating ? "MENULIS…" : draft ? "TULIS ULANG DRAFT" : "BUAT DRAFT EMAIL"}
              </button>
              {!draft && (
                <button type="button" onClick={() => setDraft(EMPTY_DRAFT)} className="btn-secondary h-12">
                  Tulis manual
                </button>
              )}
            </div>
          </form>

          {draft && (
            <section aria-labelledby={`${id}-editor`} className="panel space-y-4 p-5 sm:p-6">
              <div className="flex items-baseline justify-between gap-2">
                <p id={`${id}-editor`} className="eyebrow">
                  2 · Edit draft
                </p>
                {writerMeta && (
                  <p className="text-[11px] text-muted">
                    {writerMeta.model}
                    {writerMeta.revisions ? ` · ${writerMeta.revisions} revisi otomatis` : ""} · {errors.length} masalah
                  </p>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor={`${id}-subject`} className={label}>
                    Subject
                  </label>
                  <Counter value={draft.subject} limit={EMAIL_LIMITS.subject} />
                </div>
                <input id={`${id}-subject`} value={draft.subject} onChange={(e) => update({ subject: e.target.value })} className="field py-2 font-semibold" maxLength={EMAIL_LIMITS.max.subject} />
                <Issues issues={issuesFor("subject")} />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor={`${id}-pre`} className={label}>
                    Preheader (teks pratinjau di inbox)
                  </label>
                  <Counter value={draft.preheader} limit={EMAIL_LIMITS.preheader} />
                </div>
                <input id={`${id}-pre`} value={draft.preheader} onChange={(e) => update({ preheader: e.target.value })} className="field py-2 text-sm" maxLength={EMAIL_LIMITS.max.preheader} />
                <Issues issues={issuesFor("preheader")} />
              </div>
              <div>
                <label htmlFor={`${id}-heading`} className={label}>
                  Judul
                </label>
                <input id={`${id}-heading`} value={draft.heading} onChange={(e) => update({ heading: e.target.value })} className="field py-2" maxLength={EMAIL_LIMITS.max.heading} />
                <Issues issues={issuesFor("heading")} />
              </div>
              {draft.paragraphs.map((p, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between">
                    <label htmlFor={`${id}-p${i}`} className={label}>
                      Paragraf {i + 1}
                    </label>
                    {draft.paragraphs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => update({ paragraphs: draft.paragraphs.filter((_, j) => j !== i) })}
                        className="text-[11px] font-semibold text-muted hover:text-danger"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                  <textarea
                    id={`${id}-p${i}`}
                    value={p}
                    rows={3}
                    onChange={(e) => update({ paragraphs: draft.paragraphs.map((x, j) => (j === i ? e.target.value : x)) })}
                    className="field resize-y text-sm leading-relaxed"
                    maxLength={EMAIL_LIMITS.max.paragraph}
                  />
                  <Issues issues={issuesFor(`paragraph-${i}`)} />
                </div>
              ))}
              {draft.paragraphs.length < EMAIL_LIMITS.maxParagraphs && (
                <button type="button" onClick={() => update({ paragraphs: [...draft.paragraphs, ""] })} className="btn-secondary w-full py-2 text-xs">
                  + Tambah paragraf
                </button>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${id}-ctal`} className={label}>
                    Teks tombol
                  </label>
                  <input
                    id={`${id}-ctal`}
                    value={draft.ctaLabel}
                    onChange={(e) => update({ ctaLabel: e.target.value })}
                    placeholder={ctaUrl ? "mis. Daftar Sekarang" : "isi link CTA dulu"}
                    disabled={!ctaUrl.trim()}
                    className="field py-2 text-sm"
                    maxLength={EMAIL_LIMITS.max.ctaLabel}
                  />
                  <Issues issues={issuesFor("ctaLabel")} />
                </div>
                <div>
                  <label htmlFor={`${id}-close`} className={label}>
                    Penutup
                  </label>
                  <textarea id={`${id}-close`} value={draft.closing} rows={2} onChange={(e) => update({ closing: e.target.value })} className="field resize-y py-2 text-sm" maxLength={EMAIL_LIMITS.max.closing} />
                </div>
              </div>
            </section>
          )}
        </div>

        {/* RIGHT: preview + test + broadcast */}
        <div className="space-y-6">
          <section aria-labelledby={`${id}-preview`} className="panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="eyebrow">Preview</p>
                <h3 id={`${id}-preview`} className="mt-0.5 text-lg font-semibold tracking-tight text-navy uppercase">
                  {draft ? "Tampilan email" : "Belum ada draft"}
                </h3>
                {status?.from && <p className="mt-1 text-xs text-muted">Dari: {status.from}{status.replyTo ? ` · Balasan ke: ${status.replyTo}` : ""}</p>}
              </div>
              {draft && (
                <div role="tablist" aria-label="Ukuran preview" className="inline-flex rounded-lg border border-line p-1">
                  {(["desktop", "mobile"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={view === v}
                      onClick={() => setView(v)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${view === v ? "bg-navy text-white" : "text-muted hover:text-navy"}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-canvas p-4">
              {draft ? (
                <>
                  <div className="mx-auto mb-3 max-w-[600px] rounded-lg border border-line bg-white px-4 py-3 text-sm">
                    <p className="truncate font-semibold text-navy">{draft.subject || "(tanpa subject)"}</p>
                    <p className="truncate text-muted">{draft.preheader}</p>
                  </div>
                  <iframe
                    title="Preview email"
                    srcDoc={previewHtml}
                    sandbox=""
                    className="mx-auto block h-[640px] rounded-lg border border-line bg-white transition-all"
                    style={{ width: view === "mobile" ? 375 : "100%", maxWidth: "100%" }}
                  />
                </>
              ) : (
                <p className="px-4 py-16 text-center text-sm text-muted">Tulis brief lalu klik Buat Draft Email, atau Tulis manual.</p>
              )}
            </div>
          </section>

          {draft && (
            <section aria-labelledby={`${id}-test`} className="panel space-y-3 p-5 sm:p-6">
              <p id={`${id}-test`} className="eyebrow">
                3 · Kirim email tes (wajib sebelum broadcast)
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="email-kamu@contoh.com (maks 3, pisahkan koma)"
                  aria-label="Alamat email tes"
                  inputMode="email"
                  className="field min-w-0 flex-1"
                />
                <button
                  type="button"
                  onClick={() => void sendTest()}
                  disabled={testing || !status?.ready || !testTo.trim() || !draft.subject}
                  className="btn bg-navy text-white hover:bg-navy-700"
                >
                  {testing ? "Mengirim…" : "Kirim tes"}
                </button>
              </div>
              {testError && <p role="alert" className="text-sm text-danger">{testError}</p>}
              {testResult && (
                <p className={`text-sm ${testValid ? "text-navy" : "text-orange-hover"}`}>
                  {testValid
                    ? `✓ Tes terkirim ke ${testResult.sentTo.join(", ")}. Cek inbox (dan folder spam) sebelum broadcast.`
                    : "Draft berubah sejak tes terakhir — kirim tes lagi untuk versi ini."}
                </p>
              )}
            </section>
          )}

          {draft && (
            <section aria-labelledby={`${id}-bc`} className="panel space-y-4 border-orange/40 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <p id={`${id}-bc`} className="eyebrow">
                  4 · Broadcast ke Segment
                </p>
                <button type="button" onClick={() => void loadSegments()} disabled={!status?.ready} className="btn-ghost px-2 py-1 text-xs">
                  {segments ? "Muat ulang" : "Muat segment"}
                </button>
              </div>
              {segmentsError && <p role="alert" className="text-sm text-danger">{segmentsError}</p>}
              {segments && segments.length === 0 && (
                <p className="text-sm text-muted">Belum ada Segment di Resend. Buat segment & tambah kontak di dashboard Resend (Audience).</p>
              )}
              {segments && segments.length > 0 && (
                <>
                  <div>
                    <label htmlFor={`${id}-seg`} className="label">
                      Penerima
                    </label>
                    <select
                      id={`${id}-seg`}
                      value={segmentId}
                      onChange={(e) => {
                        setSegmentId(e.target.value);
                        setConfirmCount("");
                        setAcknowledged(false);
                      }}
                      className="select"
                    >
                      <option value="">Pilih segment…</option>
                      {segments.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} — {s.capped ? `${s.recipients}+` : s.recipients} penerima
                        </option>
                      ))}
                    </select>
                  </div>
                  {segment && (
                    <div className="space-y-3 rounded-lg bg-pale/60 p-4 text-sm text-navy">
                      {segment.capped ? (
                        <p>Segment ini lebih dari {segment.recipients} kontak — kirim broadcast besar langsung dari dashboard Resend.</p>
                      ) : (
                        <>
                          <p>
                            Email ini akan dikirim ke <span className="font-semibold">{segment.recipients} orang</span> dan{" "}
                            <span className="font-semibold">tidak bisa dibatalkan</span> setelah terkirim. Link berhenti berlangganan otomatis disertakan.
                          </p>
                          <div>
                            <label htmlFor={`${id}-confirm`} className={label}>
                              Ketik jumlah penerima ({segment.recipients}) untuk konfirmasi
                            </label>
                            <input
                              id={`${id}-confirm`}
                              value={confirmCount}
                              onChange={(e) => setConfirmCount(e.target.value.replace(/\D/g, ""))}
                              inputMode="numeric"
                              className="field w-40"
                            />
                          </div>
                          <label className="flex items-start gap-2">
                            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5 h-4 w-4 accent-navy" />
                            <span>Saya sudah cek email tes dan isinya benar.</span>
                          </label>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
              {!testValid && <p className="text-xs text-muted">Broadcast terkunci sampai email tes untuk versi terakhir terkirim.</p>}
              {errors.length > 0 && <p className="text-xs text-danger">Perbaiki {errors.length} masalah fakta di draft sebelum broadcast.</p>}
              {broadcastError && <p role="alert" className="text-sm text-danger">{broadcastError}</p>}
              {broadcastDone && (
                <p role="status" className="rounded-lg bg-pale px-4 py-3 text-sm font-semibold text-navy">
                  ✓ Broadcast dikirim ke {broadcastDone.recipients} penerima. Pantau statistiknya di dashboard Resend → Broadcasts.
                </p>
              )}
              <button
                type="button"
                onClick={() => void broadcast()}
                disabled={!canBroadcast}
                className="btn h-12 w-full bg-orange text-[17px] font-bold tracking-[0.04em] text-white hover:bg-orange-hover disabled:opacity-50"
              >
                {broadcasting ? "MENGIRIM…" : segment && !segment.capped ? `KIRIM KE ${segment.recipients} PENERIMA` : "KIRIM BROADCAST"}
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
