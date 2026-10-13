import { describe, expect, it } from "vitest";

import { buildChatGptInstructions } from "@/lib/chatgpt-instructions";
import { resolveFormat } from "@/lib/image-settings";
import { LOGO_CORNERS, describeLogoZone, isLogoCorner, logoZone } from "@/lib/logo-placement";
import { META_AD_SIZES, parsePastedPrompt } from "@/lib/meta-ads";
import { buildIntelligoPrompt, buildMetaAdSlidePrompt } from "@/lib/prompt-builder";

describe("logoZone", () => {
  const sizes = [
    [1080, 1080],
    [1080, 1350],
    [1080, 1920],
    [2560, 1440],
  ];

  it("stays inside the image for every corner and size", () => {
    for (const [w, h] of sizes) {
      for (const { id } of LOGO_CORNERS) {
        const z = logoZone(id, w, h);
        expect(z.x).toBeGreaterThanOrEqual(0);
        expect(z.y).toBeGreaterThanOrEqual(0);
        expect(z.x + z.width).toBeLessThanOrEqual(1);
        expect(z.y + z.height).toBeLessThanOrEqual(1);
        expect(z.width).toBeCloseTo(0.2);
      }
    }
  });

  it("respects Stories/Reels safe zones on 9:16", () => {
    expect(logoZone("top-left", 1080, 1920).y).toBeGreaterThanOrEqual(0.14);
    const bottom = logoZone("bottom-right", 1080, 1920);
    expect(bottom.y + bottom.height).toBeLessThanOrEqual(0.8);
  });

  it("describes the zone for the prompt", () => {
    expect(describeLogoZone("top-right", 1600, 2000)).toMatch(/top right corner: a zone about 20% of the image width/);
    expect(isLogoCorner("top-left")).toBe(true);
    expect(isLogoCorner("middle")).toBe(false);
  });
});

describe("prompt builders with auto-logo", () => {
  const portrait = resolveFormat({ formatId: "instagram-portrait" });

  it("reserves the exact corner instead of asking for manual Canva space", () => {
    const p = buildIntelligoPrompt({
      userPrompt: "Poster bootcamp AI",
      model: "gpt-image-2.5-sunburst",
      quality: "high",
      aspectRatio: portrait,
      logoCorner: "top-left",
    });
    expect(p).toMatch(/Keep this zone completely empty/);
    expect(p).toMatch(/top left corner/);
    expect(p).toMatch(/NEVER draw, recreate/);
    expect(p).not.toMatch(/added manually in Canva/);
  });

  it("keeps the default logo rule when auto-logo is off", () => {
    const p = buildMetaAdSlidePrompt({
      sharedContext: "",
      slidePrompt: "Hook visual",
      slideIndex: 1,
      totalSlides: 2,
      quality: "high",
      aspectRatio: portrait,
      hasStyleAnchor: false,
      hasSizeMaster: false,
      hasReference: false,
    });
    expect(p).toMatch(/added manually in Canva/);
  });
});

describe("buildChatGptInstructions", () => {
  const base = { topic: "Bootcamp AI Tools untuk karyawan", slideCount: 4, sizes: META_AD_SIZES, logoCorner: "top-left" as const };

  it("asks for the exact format the Meta Ads tab parses", () => {
    const text = buildChatGptInstructions(base);
    expect(text).toContain("Bootcamp AI Tools untuk karyawan");
    expect(text).toMatch(/carousel Meta Ads berisi 4 kartu/);
    expect(text).toMatch(/Gaya umum:/);
    for (let i = 1; i <= 4; i++) expect(text).toContain(`Slide ${i}:`);
    expect(text).toMatch(/JANGAN mengarang harga/);
    expect(text).toMatch(/pojok kiri atas/);
    expect(text).toContain("1080×1920");
  });

  it("produces answers that round-trip through the paste parser", () => {
    const answer = `Gaya umum: editorial bersih, navy dominan.

Slide 1: Hook — karyawan di meja penuh dokumen. Headline "KERJAAN MAKIN BANYAK?"
Slide 2: Problem — to-do list panjang. Headline "WAKTU TERASA SEDIKIT"
Slide 3: Solution — AI tools di laptop. Headline "KERJA LEBIH CERDAS"
Slide 4: CTA — tombol oranye. Headline "DAFTAR BOOTCAMP AI TOOLS"`;
    const parsed = parsePastedPrompt(answer);
    expect(parsed.shared).toBe("Gaya umum: editorial bersih, navy dominan.");
    expect(parsed.slides).toHaveLength(4);
  });

  it("uses a placeholder topic and manual-logo wording when needed", () => {
    const text = buildChatGptInstructions({ ...base, topic: " ", slideCount: 1, logoCorner: null });
    expect(text).toMatch(/TULIS TOPIK/);
    expect(text).toMatch(/1 kreatif Meta Ads/);
    expect(text).toMatch(/ditempel manual/);
  });
});
