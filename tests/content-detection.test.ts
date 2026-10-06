import { describe, expect, it } from "vitest";

import {
  detectAudiences,
  detectContentTypes,
  detectFunnelStage,
  detectReferenceIntents,
  detectSlideNumber,
  extractExactText,
  extractUrls,
  isStoryPrompt,
} from "@/lib/content-detection";

describe("detectContentTypes", () => {
  it.each([
    ["Poster promo Data Science Bootcamp", "poster"],
    ["Carousel edukasi tentang AI untuk kerja", "carousel"],
    ["buat slide 1 carousel tentang AI", "carousel"],
    ["Instagram Story untuk Job Ready Program", "story"],
    ["Poster recruitment Junior Trainer", "recruitment"],
    ["Visual mahasiswa belajar Python", "educational"],
    ["Webinar karier data analyst", "event"],
    ["Affiliate Program campaign", "campaign"],
  ])("%s → %s", (prompt, type) => {
    expect(detectContentTypes(prompt)).toContain(type);
  });

  it("falls back to general", () => {
    expect(detectContentTypes("Laptop di meja kerja minimalis")).toEqual(["general"]);
  });

  it("does not confuse words that merely contain keywords", () => {
    expect(detectContentTypes("History of storytelling")).not.toContain("story");
    expect(isStoryPrompt("IG story Job Ready")).toBe(true);
  });
});

describe("brief extraction", () => {
  it("extracts exact quoted text", () => {
    expect(extractExactText('Poster dengan headline "KERJA LEBIH CERDAS" dan CTA “Daftar Sekarang”')).toEqual([
      "KERJA LEBIH CERDAS",
      "Daftar Sekarang",
    ]);
  });

  it("preserves supplied URLs exactly and invents none", () => {
    expect(extractUrls("Tambahkan link intelligo.id/bc-ai-tools di bawah.")).toEqual(["intelligo.id/bc-ai-tools"]);
    expect(extractUrls("Poster promo bootcamp AI")).toEqual([]);
  });

  it("detects slide numbers", () => {
    expect(detectSlideNumber("buat slide 3 carousel")).toBe(3);
    expect(detectSlideNumber("slide ke-2 tentang AI")).toBe(2);
    expect(detectSlideNumber("carousel tentang AI")).toBeNull();
  });

  it("detects audience, funnel and reference intent", () => {
    expect(detectAudiences("bootcamp AI untuk fresh graduate")).toContain("fresh graduates");
    expect(detectAudiences("poster untuk karyawan")).toContain("working professionals and employees");
    expect(detectFunnelStage("retargeting slot terbatas")).toBe("retargeting");
    expect(detectReferenceIntents("Gunakan layout ini tetapi ganti kontennya")).toContain("layout");
    expect(detectReferenceIntents("Gunakan orang ini")).toContain("person");
  });
});
