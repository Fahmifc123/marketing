import { describe, expect, it } from "vitest";

import { ValidationError, validateMetaAdField, validateMetaAdInput } from "@/lib/api";
import { resolveFormat } from "@/lib/image-settings";
import { META_AD_SIZES, getMetaSize, parsePastedPrompt } from "@/lib/meta-ads";
import { buildMetaAdSlidePrompt } from "@/lib/prompt-builder";

describe("META_AD_SIZES", () => {
  it("delivers exactly the three Meta sizes and generates at the same ratio", () => {
    const exports = META_AD_SIZES.map((s) => `${s.exportSize.width}x${s.exportSize.height}`).sort();
    expect(exports).toEqual(["1080x1080", "1080x1350", "1080x1920"]);
    for (const size of META_AD_SIZES) {
      const gen = resolveFormat({ formatId: size.formatId }).generationSize;
      expect(gen.width / gen.height).toBeCloseTo(size.exportSize.width / size.exportSize.height, 3);
      expect(gen.width).toBeGreaterThanOrEqual(size.exportSize.width);
    }
  });
});

describe("parsePastedPrompt", () => {
  it("splits ChatGPT-style slide headings and keeps shared context", () => {
    const parsed = parsePastedPrompt(`Gaya umum: navy & putih, clean.

**Slide 1 – Hook**
Headline "KERJAAN MAKIN BANYAK?" foto karyawan.

### Slide 2: Problem
To-do list panjang.

SLIDE 3) CTA tombol oranye "DAFTAR SEKARANG"`);
    expect(parsed.shared).toBe("Gaya umum: navy & putih, clean.");
    expect(parsed.slides).toHaveLength(3);
    expect(parsed.slides[0]).toContain("Hook");
    expect(parsed.slides[0]).toContain('"KERJAAN MAKIN BANYAK?"');
    expect(parsed.slides[1]).toContain("Problem");
    expect(parsed.slides[2]).toContain('"DAFTAR SEKARANG"');
  });

  it("supports Indonesian and card markers, and strips code fences", () => {
    const parsed = parsePastedPrompt("```\nSlide ke-1: A visual\nKartu 2 - B visual\nCard 3. C visual\n```");
    expect(parsed.slides).toEqual(["A visual", "B visual", "C visual"]);
  });

  it("treats text without markers as a single image", () => {
    expect(parsePastedPrompt("Poster promo bootcamp AI, navy background")).toEqual({
      shared: "",
      slides: ["Poster promo bootcamp AI, navy background"],
    });
    expect(parsePastedPrompt("   ").slides).toEqual([]);
  });

  it("does not split on the word slide mid-sentence", () => {
    expect(parsePastedPrompt("A presentation slide 2 style layout").slides).toHaveLength(1);
  });
});

describe("validateMetaAdInput", () => {
  it("accepts a valid card and rejects bad positions or empty prompts", () => {
    expect(validateMetaAdInput({ sharedContext: "", slidePrompt: "Hook visual", slideIndex: 2, totalSlides: 3 })).toMatchObject({
      slideIndex: 2,
    });
    expect(() => validateMetaAdInput({ slidePrompt: "x", slideIndex: 1, totalSlides: 1 })).toThrow(ValidationError);
    expect(() => validateMetaAdInput({ slidePrompt: "Hook visual", slideIndex: 4, totalSlides: 3 })).toThrow(ValidationError);
    expect(() => validateMetaAdInput({ slidePrompt: "Hook visual", slideIndex: 1, totalSlides: 11 })).toThrow(ValidationError);
    expect(() => validateMetaAdField("not json")).toThrow(ValidationError);
    expect(validateMetaAdField(null)).toBeNull();
  });
});

describe("buildMetaAdSlidePrompt", () => {
  const base = {
    sharedContext: "Gaya umum: clean editorial",
    slidePrompt: 'Headline "KERJA LEBIH CERDAS", karyawan dengan laptop',
    slideIndex: 2,
    totalSlides: 4,
    quality: "high" as const,
    hasStyleAnchor: false,
    hasSizeMaster: false,
    hasReference: false,
  };
  const square = resolveFormat({ formatId: getMetaSize("square")!.formatId });
  const vertical = resolveFormat({ formatId: getMetaSize("vertical")!.formatId });

  it("uses the pasted prompt as primary direction and merges the brand engine", () => {
    const p = buildMetaAdSlidePrompt({ ...base, aspectRatio: square });
    expect(p).toMatch(/card 2 of 4 of a Meta Ads carousel/);
    expect(p).toContain("Gaya umum: clean editorial");
    expect(p).toContain("karyawan dengan laptop");
    expect(p).toMatch(/wherever the prompt specifies/);
    expect(p).toContain("#023047");
    expect(p).toContain('"KERJA LEBIH CERDAS"');
    expect(p).toMatch(/NEVER create, recreate/);
    expect(p).toMatch(/exactly 1080x1080px/);
  });

  it("applies Stories/Reels safe zones for 9:16", () => {
    expect(buildMetaAdSlidePrompt({ ...base, aspectRatio: vertical })).toMatch(/top ~14% and bottom ~20%/);
  });

  it("orders reference instructions: size master, then style anchor", () => {
    const p = buildMetaAdSlidePrompt({ ...base, aspectRatio: vertical, hasSizeMaster: true, hasStyleAnchor: true });
    expect(p).toMatch(/FIRST attached image is THIS SAME card/);
    expect(p).toMatch(/SECOND attached image is card 1/);
  });

  it("describes a single creative when there is one slide", () => {
    const p = buildMetaAdSlidePrompt({ ...base, slideIndex: 1, totalSlides: 1, aspectRatio: square });
    expect(p).toMatch(/Create a Meta Ads creative/);
    expect(p).not.toMatch(/swipe/);
  });
});
