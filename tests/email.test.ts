import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const resendMock = vi.hoisted(() => ({
  emails: { send: vi.fn() },
  contacts: { list: vi.fn() },
  segments: { list: vi.fn() },
  broadcasts: { create: vi.fn() },
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = resendMock.emails;
    contacts = resendMock.contacts;
    segments = resendMock.segments;
    broadcasts = resendMock.broadcasts;
  },
}));

import { signValue, verifySignedValue } from "@/lib/auth";
import {
  UNSUBSCRIBE_PLACEHOLDER,
  canonicalEmail,
  normalizeCtaUrl,
  parseEmailDraft,
  renderEmailHtml,
  renderEmailText,
  verifyEmailDraft,
  type EmailDraft,
} from "@/lib/email-content";
import { EmailWriterUnavailableError, buildEmailInput, writeEmailDraft } from "@/lib/email-writer";
import {
  countSegmentRecipients,
  emailConfig,
  resendErrorMessage,
  sendBroadcast,
  sendTestEmail,
  verifyTestToken,
} from "@/lib/resend-server";

const draft: EmailDraft = {
  subject: "Kerja lebih cerdas dengan AI tools",
  preheader: "Bootcamp praktis untuk karyawan yang ingin lebih produktif.",
  heading: "Saatnya kerja lebih cerdas",
  paragraphs: ["Kerjaan numpuk? Kamu nggak sendirian.", "Di bootcamp ini kamu belajar <AI tools> yang langsung kepakai."],
  ctaLabel: "Daftar Sekarang",
  closing: "Salam hangat,\nTim Intelligo ID",
};
const CTA = "https://intelligo.id/bc-ai-tools";
const D = { template: "classic" as const, assets: [] };

describe("email content", () => {
  it("validates drafts", () => {
    expect(parseEmailDraft(draft).paragraphs).toHaveLength(2);
    expect(() => parseEmailDraft({ ...draft, subject: "" })).toThrow();
    expect(() => parseEmailDraft({ ...draft, paragraphs: [] })).toThrow();
    expect(() => parseEmailDraft("x")).toThrow();
  });

  it("normalizes CTA links and rejects non-URLs", () => {
    expect(normalizeCtaUrl("")).toBe("");
    expect(normalizeCtaUrl("https://intelligo.id/x")).toBe("https://intelligo.id/x");
    expect(() => normalizeCtaUrl("intelligo.id/x")).toThrow();
    expect(() => normalizeCtaUrl("javascript:alert(1)")).toThrow();
  });

  it("flags invented facts and overclaims, and warns on long subjects", () => {
    const brief = "Bootcamp AI Tools untuk karyawan, early bird Rp 999.000";
    expect(verifyEmailDraft(draft, brief).filter((i) => i.severity === "error")).toEqual([]);
    const bad = { ...draft, paragraphs: ["Diskon 50% sampai 31 Desember, dijamin kerja!"], subject: "x".repeat(70) };
    const issues = verifyEmailDraft(bad, brief);
    expect(issues.some((i) => i.severity === "error" && /50%/.test(i.message))).toBe(true);
    expect(issues.some((i) => i.severity === "error" && /dijamin/.test(i.message))).toBe(true);
    expect(issues.some((i) => i.field === "subject" && i.severity === "warning")).toBe(true);
    expect(verifyEmailDraft({ ...draft, paragraphs: ["Hanya Rp 999.000"] }, brief).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("renders email-safe HTML with escaping, CTA and unsubscribe only for broadcasts", () => {
    const html = renderEmailHtml(draft, { ctaUrl: CTA, mode: "broadcast" });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("&lt;AI tools&gt;");
    expect(html).not.toContain("<AI tools>");
    expect(html).toContain(`href="${CTA}"`);
    expect(html).toContain(UNSUBSCRIBE_PLACEHOLDER);
    expect(html).not.toMatch(/<div[^>]*style="[^"]*display:\s*flex/);
    const test = renderEmailHtml(draft, { ctaUrl: CTA, mode: "test" });
    expect(test).not.toContain(UNSUBSCRIBE_PLACEHOLDER);
    expect(renderEmailHtml({ ...draft }, { ctaUrl: "", mode: "preview" })).not.toContain("Daftar Sekarang</a>");
    expect(renderEmailText(draft, { ctaUrl: CTA, mode: "broadcast" })).toContain(`Daftar Sekarang: ${CTA}`);
  });

  it("canonical form changes when content changes", () => {
    expect(canonicalEmail(draft, CTA)).not.toBe(canonicalEmail({ ...draft, subject: "lain" }, CTA));
    expect(canonicalEmail(draft, CTA)).not.toBe(canonicalEmail(draft, ""));
  });
});

function fakeClient(outputs: Array<string | Error>) {
  const create = vi.fn(async () => {
    const next = outputs.shift();
    if (next instanceof Error) throw next;
    return { status: "completed", output_text: next };
  });
  return { client: { responses: { create } } as unknown as OpenAI, create };
}

describe("writeEmailDraft", () => {
  const input = { brief: "Bootcamp AI Tools untuk karyawan, early bird Rp 999.000", emailType: "promo" as const, ctaUrl: CTA };

  it("puts the brief and CTA in the model input", () => {
    const text = buildEmailInput(input);
    expect(text).toContain("Promo program");
    expect(text).toContain(CTA);
  });

  it("returns a verified draft and revises once on invented facts", async () => {
    const bad = { ...draft, paragraphs: ["Diskon 70% hari ini"] };
    const { client, create } = fakeClient([JSON.stringify(bad), JSON.stringify(draft)]);
    const result = await writeEmailDraft({ apiKey: "sk-x", input, client });
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.revisions).toBe(1);
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("drops the CTA label when there is no link", async () => {
    const { client } = fakeClient([JSON.stringify(draft)]);
    const result = await writeEmailDraft({ apiKey: "sk-x", input: { ...input, ctaUrl: "" }, client });
    expect(result.draft.ctaLabel).toBe("");
  });

  it("reports when no text model is available and surfaces bad keys", async () => {
    const nf = OpenAI.APIError.generate(404, { error: { code: "model_not_found" } }, "nf", new Headers());
    await expect(writeEmailDraft({ apiKey: "sk-x", input, client: fakeClient([nf, "nope"]).client })).rejects.toBeInstanceOf(
      EmailWriterUnavailableError,
    );
    const auth = OpenAI.APIError.generate(401, { error: { code: "invalid_api_key" } }, "bad", new Headers());
    await expect(writeEmailDraft({ apiKey: "sk-x", input, client: fakeClient([auth]).client })).rejects.toBeInstanceOf(
      OpenAI.AuthenticationError,
    );
  });
});

describe("signed values", () => {
  beforeEach(() => vi.stubEnv("MARKETING_ACCESS_CODE", "Marketing_123"));
  afterEach(() => vi.unstubAllEnvs());

  it("binds to the value and expires", async () => {
    const token = await signValue("a", 1000);
    expect(await verifySignedValue(token, "a")).toBe(true);
    expect(await verifySignedValue(token, "b")).toBe(false);
    expect(await verifySignedValue(token, "a", Date.now() + 2000)).toBe(false);
    expect(await verifySignedValue("junk", "a")).toBe(false);
  });
});

describe("resend server", () => {
  beforeEach(() => {
    vi.stubEnv("MARKETING_ACCESS_CODE", "Marketing_123");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Intelligo ID <info@marketing.intelligo.id>");
    Object.values(resendMock).forEach((group) => Object.values(group).forEach((fn) => fn.mockReset()));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reports configuration", () => {
    expect(emailConfig().ready).toBe(true);
    vi.stubEnv("RESEND_API_KEY", "");
    expect(emailConfig().ready).toBe(false);
  });

  it("sends a test and binds the token to the exact content", async () => {
    resendMock.emails.send.mockResolvedValue({ data: { id: "e1" }, error: null });
    const { token } = await sendTestEmail(draft, CTA, D, ["me@example.com"]);
    const payload = resendMock.emails.send.mock.calls[0][0];
    expect(payload.subject).toBe(`[TES] ${draft.subject}`);
    expect(payload.from).toContain("marketing.intelligo.id");
    expect(payload.html).not.toContain(UNSUBSCRIBE_PLACEHOLDER);
    expect(await verifyTestToken(token, draft, CTA, D)).toBe(true);
    expect(await verifyTestToken(token, { ...draft, subject: "ubah" }, CTA, D)).toBe(false);
  });

  it("counts subscribed recipients across pages", async () => {
    const page = (ids: string[], more: boolean, unsub = 0) => ({
      data: {
        object: "list",
        has_more: more,
        data: ids.map((id, i) => ({ id, email: `${id}@x.com`, unsubscribed: i < unsub })),
      },
      error: null,
    });
    resendMock.contacts.list.mockResolvedValueOnce(page(["a", "b", "c"], true, 1)).mockResolvedValueOnce(page(["d"], false));
    expect(await countSegmentRecipients("seg")).toEqual({ recipients: 3, capped: false });
    expect(resendMock.contacts.list.mock.calls[1][0]).toMatchObject({ segmentId: "seg", after: "c" });
  });

  it("creates and sends a broadcast with the unsubscribe placeholder", async () => {
    resendMock.broadcasts.create.mockResolvedValue({ data: { id: "b1" }, error: null });
    expect(await sendBroadcast({ draft, ctaUrl: CTA, design: D, segmentId: "seg", name: "Promo" })).toEqual({ id: "b1" });
    const payload = resendMock.broadcasts.create.mock.calls[0][0];
    expect(payload).toMatchObject({ segmentId: "seg", send: true, subject: draft.subject, previewText: draft.preheader });
    expect(payload.html).toContain(UNSUBSCRIBE_PLACEHOLDER);
  });

  it("maps Resend errors to clean messages", async () => {
    resendMock.emails.send.mockResolvedValue({ data: null, error: { message: "API key is invalid", statusCode: 401 } });
    const err = await sendTestEmail(draft, CTA, D, ["me@example.com"]).catch((e) => e);
    expect(resendErrorMessage(err).code).toBe("resend_auth");
    vi.stubEnv("EMAIL_FROM", "");
    const cfg = await sendTestEmail(draft, CTA, D, ["me@example.com"]).catch((e) => e);
    expect(resendErrorMessage(cfg).code).toBe("email_not_configured");
  });
});
