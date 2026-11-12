/**
 * Server-side Resend access for the Email Marketing module.
 *
 * - RESEND_API_KEY and EMAIL_FROM live only in the deployment environment;
 *   they never reach the browser.
 * - A test send returns a signed token bound to the exact content, and a
 *   broadcast is refused unless that token matches the content being sent
 *   and the typed recipient count matches the segment.
 */
import "server-only";

import { Resend } from "resend";

import { signValue, verifySignedValue } from "@/lib/auth";
import {
  canonicalEmail,
  renderEmailHtml,
  renderEmailText,
  type EmailDraft,
} from "@/lib/email-content";

/** Contacts are counted page by page; segments larger than this show as "at least". */
export const MAX_COUNTED_CONTACTS = 10_000;
const PAGE_SIZE = 100;
/** A test send stays valid for broadcasting for 6 hours. */
const TEST_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

export class EmailConfigError extends Error {}
export class ResendRequestError extends Error {
  constructor(
    message: string,
    public status: number | null,
  ) {
    super(message);
  }
}

export function emailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || undefined;
  return { apiKey, from, replyTo, ready: Boolean(apiKey && from) };
}

function client(): { resend: Resend; from: string; replyTo?: string } {
  const { apiKey, from, replyTo } = emailConfig();
  if (!apiKey || !from) throw new EmailConfigError("RESEND_API_KEY atau EMAIL_FROM belum diatur di server.");
  return { resend: new Resend(apiKey), from, replyTo };
}

function unwrap<T>(res: { data: T | null; error: { message: string; statusCode: number | null } | null }): T {
  if (res.error || res.data === null) {
    throw new ResendRequestError(res.error?.message ?? "Resend request failed", res.error?.statusCode ?? null);
  }
  return res.data;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function contentHash(draft: EmailDraft, ctaUrl: string): Promise<string> {
  return sha256(canonicalEmail(draft, ctaUrl));
}

/** Sends the exact email to up to a few test addresses and returns a broadcast token for that content. */
export async function sendTestEmail(draft: EmailDraft, ctaUrl: string, to: string[]): Promise<{ token: string }> {
  const { resend, from, replyTo } = client();
  unwrap(
    await resend.emails.send({
      from,
      to,
      replyTo,
      subject: `[TES] ${draft.subject}`,
      html: renderEmailHtml(draft, { ctaUrl, mode: "test" }),
      text: renderEmailText(draft, { ctaUrl, mode: "test" }),
    }),
  );
  const hash = await contentHash(draft, ctaUrl);
  return { token: await signValue(`email-test:${hash}`, TEST_TOKEN_TTL_MS) };
}

export async function verifyTestToken(token: unknown, draft: EmailDraft, ctaUrl: string): Promise<boolean> {
  if (typeof token !== "string") return false;
  const hash = await contentHash(draft, ctaUrl);
  return verifySignedValue(token, `email-test:${hash}`);
}

export interface SegmentSummary {
  id: string;
  name: string;
  /** Subscribed contacts (unsubscribed ones never receive broadcasts). */
  recipients: number;
  /** True when counting stopped at MAX_COUNTED_CONTACTS. */
  capped: boolean;
}

export async function countSegmentRecipients(segmentId: string): Promise<{ recipients: number; capped: boolean }> {
  const { resend } = client();
  let recipients = 0;
  let seen = 0;
  let after: string | undefined;
  for (;;) {
    const page = unwrap(await resend.contacts.list({ segmentId, limit: PAGE_SIZE, ...(after ? { after } : {}) }));
    recipients += page.data.filter((c) => !c.unsubscribed).length;
    seen += page.data.length;
    if (!page.has_more || page.data.length === 0) return { recipients, capped: false };
    if (seen >= MAX_COUNTED_CONTACTS) return { recipients, capped: true };
    after = page.data[page.data.length - 1].id;
  }
}

export async function listSegments(): Promise<SegmentSummary[]> {
  const { resend } = client();
  const segments = unwrap(await resend.segments.list({ limit: 100 })).data;
  return Promise.all(
    segments.map(async (s) => ({ id: s.id, name: s.name, ...(await countSegmentRecipients(s.id)) })),
  );
}

/** Creates and immediately sends a broadcast to a segment. */
export async function sendBroadcast(opts: {
  draft: EmailDraft;
  ctaUrl: string;
  segmentId: string;
  name: string;
}): Promise<{ id: string }> {
  const { resend, from, replyTo } = client();
  const data = unwrap(
    await resend.broadcasts.create({
      name: opts.name,
      from,
      replyTo,
      segmentId: opts.segmentId,
      subject: opts.draft.subject,
      previewText: opts.draft.preheader || undefined,
      html: renderEmailHtml(opts.draft, { ctaUrl: opts.ctaUrl, mode: "broadcast" }),
      text: renderEmailText(opts.draft, { ctaUrl: opts.ctaUrl, mode: "broadcast" }),
      send: true,
    }),
  );
  return { id: data.id };
}

/** Maps Resend failures to clean messages (no keys or internals). */
export function resendErrorMessage(err: unknown): { status: number; code: string; message: string } {
  if (err instanceof EmailConfigError) {
    return { status: 503, code: "email_not_configured", message: "Email belum dikonfigurasi di server (RESEND_API_KEY / EMAIL_FROM)." };
  }
  if (err instanceof ResendRequestError) {
    if (err.status === 401 || err.status === 403 || /api key/i.test(err.message)) {
      return { status: 502, code: "resend_auth", message: "API key Resend ditolak. Periksa RESEND_API_KEY di Vercel." };
    }
    if (err.status === 429) return { status: 429, code: "resend_rate_limited", message: "Terlalu banyak request ke Resend. Coba lagi sebentar." };
    if (err.status === 422 || err.status === 400) {
      return { status: 400, code: "resend_rejected", message: `Resend menolak permintaan: ${err.message.slice(0, 200)}` };
    }
  }
  return { status: 502, code: "resend_failed", message: "Gagal menghubungi Resend. Coba lagi." };
}
