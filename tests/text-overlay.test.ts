import { describe, expect, it } from "vitest";

import { buildChatGptInstructions } from "@/lib/chatgpt-instructions";
import { resolveFormat } from "@/lib/image-settings";
import { logoZone } from "@/lib/logo-placement";
import { META_AD_SIZES, getMetaSize, parsePastedPrompt } from "@/lib/meta-ads";
import { buildMetaAdSlidePrompt } from "@/lib/prompt-builder";
import { extractCardText, stripQuotedCopy, textZone } from "@/lib/text-layout";

const overlaps = (a: { y: number; height: number }, b: { y: number; height: number }) =>
  a.y < b.y + b.height && b.y < a.y + a.height;

describe("textZone", () => {
  const dims = [
    [1080, 1080],
    [1080, 1350],
    [1080, 1920],
  ];

  it("stays inside the image and never overlaps the logo", () => {
    for (const [w, h] of dims) {
      for (const layout of ["top", "bottom"] as const) {
        for (const corner of ["top-left", "top-right", "bottom-left", "bottom-right"] as const) {
          const z = textZone(layout, w, h, corner);
          expect(z.y).toBeGreaterThanOrEqual(0);
          expect(z.y + z.height).toBeLessThanOrEqual(1);
          expect(overlaps(z, logoZone(corner, w, h))).toBe(false);
        }
      }
    }
  });

  it("keeps 9:16 copy out of Stories/Reels interface areas", () => {
    for (const layout of ["top", "bottom"] as const) {
      const z = textZone(layout, 1080, 1920, null);
      expect(z.y).toBeGreaterThanOrEqual(0.14);
      expect(z.y + z.height).toBeLessThanOrEqual(0.8);
    }
  });
});

describe("extractCardText", () => {
  it("reads labelled copy", () => {
    expect(
      extractCardText('CTA card. Headline "SIAP KERJA LEBIH CERDAS?" Teks pendukung "Belajar AI tools bareng mentor." Tombol "Daftar Sekarang"'),
    ).toEqual({ headline: "SIAP KERJA LEBIH CERDAS?", supporting: "Belajar AI tools bareng mentor.", cta: "Daftar Sekarang" });
  });

  it("falls back to quote order and detects button wording", () => {
    expect(extractCardText('Visual laptop, "KERJAAN MAKIN BANYAK?" lalu "Waktu terasa sedikit", tombol oranye "DAFTAR"')).toEqual({
      headline: "KERJAAN MAKIN BANYAK?",
      supporting: "Waktu terasa sedikit",
      cta: "DAFTAR",
    });
    expect(extractCardText("Tanpa teks sama sekali")).toEqual({ headline: "", supporting: "", cta: "" });
  });

  it("strips quoted copy so the model cannot render it", () => {
    expect(stripQuotedCopy('Headline "HALO" di atas')).toBe("Headline [copy added later by the app] di atas");
    expect(stripQuotedCopy("no quotes")).toBe("no quotes");
  });
});

describe("Meta Ads prompt with app-rendered copy", () => {
  const vertical = resolveFormat({ formatId: getMetaSize("vertical")!.formatId });
  const p = buildMetaAdSlidePrompt({
    sharedContext: 'Gaya umum, tagline "BELAJAR AI"',
    slidePrompt: 'Karyawan dengan laptop. Headline "KERJA LEBIH CERDAS". Tombol "Daftar"',
    slideIndex: 1,
    totalSlides: 3,
    quality: "high",
    aspectRatio: vertical,
    hasStyleAnchor: false,
    hasSizeMaster: false,
    hasReference: false,
    logoCorner: "top-left",
    textOverlay: { layout: "bottom" },
  });

  it("tells the model to render no text and keep the text zone calm", () => {
    expect(p).toMatch(/Render NO text at all/);
    expect(p).toMatch(/calm, low-detail text zone/);
    expect(p).toMatch(/from 50% to 78% of the image height/);
  });

  it("removes the quoted copy from the prompt", () => {
    expect(p).not.toContain("KERJA LEBIH CERDAS");
    expect(p).not.toContain("BELAJAR AI");
    expect(p).toContain("[copy added later by the app]");
  });
});

describe("ChatGPT instructions for app-rendered copy", () => {
  it("asks for explicit labels that the extractor understands", () => {
    const text = buildChatGptInstructions({ topic: "AI", slideCount: 3, sizes: META_AD_SIZES, logoCorner: null, textOverlay: true });
    expect(text).toMatch(/Headline "\.\.\.", Teks pendukung "\.\.\." \(opsional\), Tombol "\.\.\."/);
    const answer = `Gaya umum: clean.

Slide 1: Hook — karyawan lelah, tanpa teks di gambar. Headline "KERJAAN MAKIN BANYAK?" Teks pendukung "Waktu terasa makin sedikit."
Slide 2: Solution — AI tools. Headline "KERJA LEBIH CERDAS"
Slide 3: CTA — layout bersih. Headline "MULAI SEKARANG" Tombol "Daftar Bootcamp"`;
    const parsed = parsePastedPrompt(answer);
    const texts = parsed.slides.map(extractCardText);
    expect(texts[0]).toEqual({ headline: "KERJAAN MAKIN BANYAK?", supporting: "Waktu terasa makin sedikit.", cta: "" });
    expect(texts[2]).toEqual({ headline: "MULAI SEKARANG", supporting: "", cta: "Daftar Bootcamp" });
  });
});

describe("extractCardText label priority", () => {
  it("prefers an explicit headline label over nearby button wording", () => {
    expect(extractCardText('Ada tombol CTA dan headline "BELAJAR AI" lalu tombol "Daftar"')).toEqual({
      headline: "BELAJAR AI",
      supporting: "",
      cta: "Daftar",
    });
  });
});
