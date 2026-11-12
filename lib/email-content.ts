/**
 * Email marketing content: the structured draft the writer produces, its
 * validation and fact verification, and the email-safe HTML/text renderer.
 * Shared by the server and the browser (preview). Contains no internal prompt text.
 */
import { findOverclaim, findUnsupportedFacts } from "@/lib/carousel-verifier";

export const EMAIL_TYPES = [
  { id: "promo", label: "Promo program" },
  { id: "newsletter", label: "Newsletter" },
  { id: "event", label: "Undangan event / webinar" },
  { id: "education", label: "Edukasi / tips" },
  { id: "announcement", label: "Pengumuman" },
] as const;

export type EmailType = (typeof EMAIL_TYPES)[number]["id"];

export function isEmailType(value: unknown): value is EmailType {
  return EMAIL_TYPES.some((t) => t.id === value);
}

export const EMAIL_LIMITS = {
  /** Recommended lengths (inbox truncation). */
  subject: 60,
  preheader: 110,
  max: { subject: 150, preheader: 200, heading: 120, paragraph: 1200, ctaLabel: 40, closing: 300 },
  minParagraphs: 1,
  maxParagraphs: 6,
  briefMax: 4000,
  maxTestRecipients: 3,
} as const;

export interface EmailDraft {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  ctaLabel: string;
  closing: string;
}

export interface EmailIssue {
  field: string;
  severity: "error" | "warning";
  message: string;
}

export class EmailValidationError extends Error {}

function str(value: unknown, max: number, field: string, required = false): string {
  if (typeof value !== "string") throw new EmailValidationError(`Field "${field}" tidak valid.`);
  const v = value.trim();
  if (required && !v) throw new EmailValidationError(`Field "${field}" wajib diisi.`);
  if (v.length > max) throw new EmailValidationError(`Field "${field}" terlalu panjang.`);
  return v;
}

/** Validates an untrusted draft (from the model or the browser). */
export function parseEmailDraft(input: unknown): EmailDraft {
  if (!input || typeof input !== "object") throw new EmailValidationError("Draft email tidak valid.");
  const raw = input as Record<string, unknown>;
  const { max } = EMAIL_LIMITS;
  if (!Array.isArray(raw.paragraphs)) throw new EmailValidationError("Isi email tidak valid.");
  const paragraphs = raw.paragraphs
    .slice(0, EMAIL_LIMITS.maxParagraphs)
    .map((p, i) => str(p, max.paragraph, `paragraphs[${i}]`))
    .filter(Boolean);
  if (paragraphs.length < EMAIL_LIMITS.minParagraphs) throw new EmailValidationError("Isi email kosong.");
  return {
    subject: str(raw.subject, max.subject, "subject", true),
    preheader: str(raw.preheader ?? "", max.preheader, "preheader"),
    heading: str(raw.heading ?? "", max.heading, "heading"),
    paragraphs,
    ctaLabel: str(raw.ctaLabel ?? "", max.ctaLabel, "ctaLabel"),
    closing: str(raw.closing ?? "", max.closing, "closing"),
  };
}

/** A CTA link must be an absolute https URL. */
export function normalizeCtaUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const url = value.trim();
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    return parsed.toString();
  } catch {
    throw new EmailValidationError("Link CTA harus berupa URL lengkap, mis. https://intelligo.id/program.");
  }
}

/**
 * Checks every text field against what the marketer wrote (brief + CTA link):
 * invented facts / overclaims are errors, long subject/preheader warnings.
 */
export function verifyEmailDraft(draft: EmailDraft, source: string): EmailIssue[] {
  const issues: EmailIssue[] = [];
  const fields: Array<[string, string, string]> = [
    ["subject", draft.subject, "Subject"],
    ["preheader", draft.preheader, "Preheader"],
    ["heading", draft.heading, "Judul"],
    ...draft.paragraphs.map((p, i) => [`paragraph-${i}`, p, `Paragraf ${i + 1}`] as [string, string, string]),
    ["ctaLabel", draft.ctaLabel, "Tombol"],
    ["closing", draft.closing, "Penutup"],
  ];
  for (const [field, value, label] of fields) {
    if (!value) continue;
    const facts = findUnsupportedFacts(value, source);
    if (facts.length) issues.push({ field, severity: "error", message: `${label}: fakta tidak ada di brief — ${facts.join(", ")}.` });
    const claim = findOverclaim(value, source);
    if (claim) issues.push({ field, severity: "error", message: `${label}: klaim berlebihan "${claim}".` });
  }
  if (draft.subject.length > EMAIL_LIMITS.subject) {
    issues.push({ field: "subject", severity: "warning", message: `Subject ${draft.subject.length}/${EMAIL_LIMITS.subject} karakter — bisa terpotong di inbox.` });
  }
  if (draft.preheader.length > EMAIL_LIMITS.preheader) {
    issues.push({ field: "preheader", severity: "warning", message: `Preheader ${draft.preheader.length}/${EMAIL_LIMITS.preheader} karakter.` });
  }
  return issues;
}

/** Resend replaces this with each recipient's unsubscribe link in broadcasts. */
export const UNSUBSCRIBE_PLACEHOLDER = "{{{RESEND_UNSUBSCRIBE_URL}}}";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const NAVY = "#023047";
const ORANGE = "#FF5400";
const OFF_WHITE = "#F8FAFB";
const MUTED = "#5A6B73";
const FONT = "Arial, Helvetica, sans-serif";

export interface RenderOptions {
  ctaUrl: string;
  /** "broadcast" adds Resend's unsubscribe placeholder; "test" and "preview" show a dummy link. */
  mode: "broadcast" | "test" | "preview";
}

/** Email-safe HTML: table layout, inline styles, 600px, brand colours, no logo fabrication. */
export function renderEmailHtml(draft: EmailDraft, { ctaUrl, mode }: RenderOptions): string {
  const unsubscribe = mode === "broadcast" ? UNSUBSCRIBE_PLACEHOLDER : "#";
  const paragraphs = draft.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:16px;line-height:26px;color:${NAVY};">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  const button =
    ctaUrl && draft.ctaLabel
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;"><tr><td bgcolor="${ORANGE}" style="background-color:${ORANGE};border-radius:8px;"><a href="${escapeHtml(ctaUrl)}" target="_blank" style="display:inline-block;padding-top:14px;padding-bottom:14px;padding-left:28px;padding-right:28px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:bold;color:#FFFFFF;text-decoration:none;">${escapeHtml(draft.ctaLabel)}</a></td></tr></table>`
      : "";
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${escapeHtml(draft.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${OFF_WHITE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${OFF_WHITE};">${escapeHtml(draft.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${OFF_WHITE}" style="background-color:${OFF_WHITE};">
<tr><td align="center" style="padding-top:24px;padding-bottom:24px;padding-left:12px;padding-right:12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td bgcolor="${NAVY}" style="background-color:${NAVY};padding-top:20px;padding-bottom:20px;padding-left:32px;padding-right:32px;border-radius:12px 12px 0 0;font-family:${FONT};font-size:13px;line-height:18px;font-weight:bold;letter-spacing:3px;color:#FFFFFF;">INTELLIGO ID</td></tr>
<tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding-top:32px;padding-bottom:16px;padding-left:32px;padding-right:32px;">
${draft.heading ? `<h1 style="margin:0 0 20px 0;font-family:${FONT};font-size:26px;line-height:34px;font-weight:bold;color:${NAVY};">${escapeHtml(draft.heading)}</h1>` : ""}
${paragraphs}
${button}
${draft.closing ? `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:16px;line-height:26px;color:${NAVY};">${escapeHtml(draft.closing).replace(/\n/g, "<br>")}</p>` : ""}
</td></tr>
<tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding-top:16px;padding-bottom:28px;padding-left:32px;padding-right:32px;border-top:1px solid #DCE5E9;border-radius:0 0 12px 12px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">
Kamu menerima email ini karena terdaftar di komunitas Intelligo ID.<br>
<a href="${unsubscribe}" style="color:${MUTED};text-decoration:underline;">Berhenti berlangganan</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Plain-text alternative (improves deliverability). */
export function renderEmailText(draft: EmailDraft, { ctaUrl, mode }: RenderOptions): string {
  return [
    draft.heading,
    ...draft.paragraphs,
    ctaUrl && draft.ctaLabel ? `${draft.ctaLabel}: ${ctaUrl}` : "",
    draft.closing,
    "",
    "—",
    "Kamu menerima email ini karena terdaftar di komunitas Intelligo ID.",
    `Berhenti berlangganan: ${mode === "broadcast" ? UNSUBSCRIBE_PLACEHOLDER : "(link tersedia di email broadcast)"}`,
  ]
    .filter((l, i, arr) => l || arr[i - 1])
    .join("\n\n")
    .trim();
}

/** Stable serialization used to bind a test send to the exact content being broadcast. */
export function canonicalEmail(draft: EmailDraft, ctaUrl: string): string {
  return JSON.stringify([draft.subject, draft.preheader, draft.heading, draft.paragraphs, draft.ctaLabel, draft.closing, ctaUrl]);
}
