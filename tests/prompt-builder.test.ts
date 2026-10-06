import { describe, expect, it } from "vitest";

import { resolveFormat } from "@/lib/image-settings";
import { buildIntelligoPrompt } from "@/lib/prompt-builder";

const portrait = resolveFormat({ formatId: "instagram-portrait" });

function build(userPrompt: string, extra: Partial<Parameters<typeof buildIntelligoPrompt>[0]> = {}) {
  return buildIntelligoPrompt({
    userPrompt,
    model: "gpt-image-2.5-sunburst",
    quality: "high",
    aspectRatio: portrait,
    ...extra,
  });
}

describe("buildIntelligoPrompt", () => {
  const prompt = build("Poster promo Bootcamp AI Tools untuk karyawan");

  it("includes the user's intent verbatim", () => {
    expect(prompt).toContain("Poster promo Bootcamp AI Tools untuk karyawan");
  });

  it("applies the brand palette automatically", () => {
    for (const hex of ["#023047", "#FF5400", "#F8FAFB", "#EAF2F5", "#1F4E63"]) expect(prompt).toContain(hex);
  });

  it("never fabricates the logo by default", () => {
    expect(prompt).toMatch(/NEVER create, recreate, approximate or stylize the Intelligo ID logo/);
    expect(prompt).toMatch(/official Intelligo ID logo to be added manually in Canva/);
  });

  it("forbids invented facts, URLs and QR codes", () => {
    expect(prompt).toMatch(/Never invent program prices/);
    expect(prompt).toMatch(/do not show any URL/);
    expect(prompt).toMatch(/Do not include any QR code/);
  });

  it("applies poster logic, audience and aspect ratio", () => {
    expect(prompt).toMatch(/Marketing poster logic/);
    expect(prompt).toMatch(/working professionals/);
    expect(prompt).toMatch(/Aspect ratio: 4:5\./);
    expect(prompt).toMatch(/1080x1350/);
  });

  it("preserves supplied URLs and exact text", () => {
    const p = build('Poster AI Tools, headline "KERJA LEBIH CERDAS", link intelligo.id/bc-ai-tools');
    expect(p).toContain('"KERJA LEBIH CERDAS"');
    expect(p).toContain('"intelligo.id/bc-ai-tools"');
  });

  it("uses a placeholder instead of drawing QR codes", () => {
    expect(build("Poster event dengan QR code pendaftaran")).toMatch(/Do NOT draw any QR pattern/);
  });

  it("generates only the requested carousel slide", () => {
    const p = build("buat slide 2 carousel tentang AI");
    expect(p).toMatch(/This is slide 2 of the carousel/);
    expect(p).toMatch(/Slide role PROBLEM/);
    expect(p).toMatch(/Generate only the single slide/);
  });

  it("adds reference instructions only when a reference is attached", () => {
    expect(build("Poster AI")).not.toMatch(/REFERENCE IMAGE:/);
    const p = build("Gunakan layout ini tetapi ganti kontennya", { referenceImage: { name: "ref.png" } });
    expect(p).toMatch(/REFERENCE IMAGE:/);
    expect(p).toMatch(/Preserve the reference's layout/);
  });

  it("uses the official logo from a reference without altering it", () => {
    const p = build("Poster AI pakai logo dari referensi", { referenceImage: {} });
    expect(p).toMatch(/Reproduce it exactly as provided/);
    expect(p).not.toMatch(/NEVER create, recreate/);
  });

  it("stays within the model's prompt limit", () => {
    expect(build("x".repeat(4000)).length).toBeLessThan(32000);
  });
});
