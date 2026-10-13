import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import {
  META_COPY_LIMITS,
  copySource,
  formatCopyForAdsManager,
  parseMetaAdCopy,
  verifyMetaAdCopy,
  type MetaAdCopy,
} from "@/lib/meta-copy";
import { CopyUnavailableError, buildCopyInput, writeMetaAdCopy } from "@/lib/meta-copy-writer";

const input = {
  sharedContext: "Bootcamp AI Tools untuk karyawan, early bird Rp 999.000",
  slides: ["Hook karyawan lelah", "Solusi AI tools", "CTA daftar"],
  texts: [
    { headline: "KERJAAN MAKIN BANYAK?", supporting: "", cta: "" },
    { headline: "KERJA LEBIH CERDAS", supporting: "", cta: "" },
    { headline: "MULAI SEKARANG", supporting: "", cta: "Daftar" },
  ],
};

const good: MetaAdCopy = {
  primaryTexts: [
    "Kerjaan numpuk, waktu nggak cukup? Saatnya kerja lebih cerdas pakai AI tools.",
    "Pelajari AI tools yang langsung bisa dipakai di kerjaan sehari-hari.",
    "Early bird Rp 999.000 — yuk mulai belajar AI tools bareng Intelligo ID.",
  ],
  cards: [
    { headline: "Kerjaan makin numpuk?", description: "Kamu nggak sendirian" },
    { headline: "AI bantu kerja lebih cepat", description: "Praktis & relevan" },
    { headline: "Daftar Bootcamp AI Tools", description: "Kuota early bird" },
  ],
  ctaButton: "Sign Up",
  ctaReason: "Tujuannya pendaftaran.",
};

describe("parseMetaAdCopy", () => {
  it("accepts valid copy and normalizes unknown CTA buttons", () => {
    expect(parseMetaAdCopy(good, 3).ctaButton).toBe("Sign Up");
    expect(parseMetaAdCopy({ ...good, ctaButton: "Buy Now Please" }, 3).ctaButton).toBe("Learn More");
  });

  it("rejects the wrong number of cards or empty primary text", () => {
    expect(() => parseMetaAdCopy(good, 4)).toThrow();
    expect(() => parseMetaAdCopy({ ...good, primaryTexts: [] }, 3)).toThrow();
  });
});

describe("verifyMetaAdCopy", () => {
  const source = copySource(input);

  it("accepts facts from the brief and flags invented ones", () => {
    expect(verifyMetaAdCopy(good, source).filter((i) => i.severity === "error")).toEqual([]);
    const bad = { ...good, primaryTexts: ["Diskon 50% sampai 31 Desember, dijamin kerja!"] };
    const errors = verifyMetaAdCopy(bad, source).filter((i) => i.severity === "error");
    expect(errors.map((e) => e.message).join(" ")).toMatch(/50%/);
    expect(errors.map((e) => e.message).join(" ")).toMatch(/dijamin/);
  });

  it("warns when a field exceeds Meta's recommended length", () => {
    const long = { ...good, cards: good.cards.map((c) => ({ ...c, headline: "x".repeat(META_COPY_LIMITS.headline + 1) })) };
    expect(verifyMetaAdCopy(long, source).some((i) => i.severity === "warning" && i.field === "card-0-headline")).toBe(true);
  });

  it("formats a pasteable block", () => {
    const text = formatCopyForAdsManager(good, 1);
    expect(text).toContain(good.primaryTexts[1]);
    expect(text).toContain("KARTU 3");
    expect(text).toContain("CTA BUTTON: Sign Up");
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

describe("writeMetaAdCopy", () => {
  it("includes each card and its on-image text in the model input", () => {
    const text = buildCopyInput(input);
    expect(text).toContain("Card 3: CTA daftar");
    expect(text).toContain('button "Daftar"');
    expect(text).toMatch(/exactly 3 card entries/);
  });

  it("returns verified copy with strict structured output", async () => {
    const { client, create } = fakeClient([JSON.stringify(good)]);
    const result = await writeMetaAdCopy({ apiKey: "sk-test", input, client });
    expect(result.revisions).toBe(0);
    expect(result.copy.cards).toHaveLength(3);
    const body = (create.mock.calls[0] as unknown[])[0] as { text: { format: { strict: boolean; name: string } } };
    expect(body.text.format).toMatchObject({ strict: true, name: "meta_ad_copy" });
  });

  it("revises once when the verifier finds invented facts", async () => {
    const bad = { ...good, primaryTexts: ["Diskon 70% hari ini!"] };
    const { client, create } = fakeClient([JSON.stringify(bad), JSON.stringify(good)]);
    const result = await writeMetaAdCopy({ apiKey: "sk-test", input, client });
    expect(create).toHaveBeenCalledTimes(2);
    expect(((create.mock.calls[1] as unknown[])[0] as { input: string }).input).toMatch(/70%/);
    expect(result.revisions).toBe(1);
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("tries the next model and reports when none is available", async () => {
    const notFound = OpenAI.APIError.generate(404, { error: { code: "model_not_found" } }, "nf", new Headers());
    const { client } = fakeClient([notFound, "not json"]);
    await expect(writeMetaAdCopy({ apiKey: "sk-test", input, client })).rejects.toBeInstanceOf(CopyUnavailableError);
  });

  it("surfaces invalid API keys", async () => {
    const auth = OpenAI.APIError.generate(401, { error: { code: "invalid_api_key" } }, "bad", new Headers());
    const { client } = fakeClient([auth]);
    await expect(writeMetaAdCopy({ apiKey: "sk-test", input, client })).rejects.toBeInstanceOf(OpenAI.AuthenticationError);
  });
});
