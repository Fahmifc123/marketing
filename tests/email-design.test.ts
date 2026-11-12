import { describe, expect, it } from "vitest";

import { EMAIL_TEMPLATES, isAllowedAssetUrl, parseEmailAssets, parseEmailDesign, type EmailAsset } from "@/lib/email-assets";
import { UNSUBSCRIBE_PLACEHOLDER, canonicalEmail, renderEmailHtml, renderEmailText, type EmailDraft } from "@/lib/email-content";

const draft: EmailDraft = {
  subject: "Kerja lebih cerdas",
  preheader: "Preheader",
  heading: "Saatnya kerja lebih cerdas",
  paragraphs: ["Paragraf satu.", "Paragraf dua."],
  ctaLabel: "Daftar",
  closing: "Salam,\nTim Intelligo ID",
};
const CTA = "https://intelligo.id/x";
const BLOB = "https://abc123.public.blob.vercel-storage.com/email";
const img: EmailAsset = { url: `${BLOB}/banner-xyz.jpg`, name: "banner.jpg", kind: "image", contentType: "image/jpeg", size: 1000, alt: "Banner <bootcamp>" };
const img2: EmailAsset = { ...img, url: `${BLOB}/kelas.png`, name: "kelas.png", contentType: "image/png", alt: "Suasana kelas" };
const pdf: EmailAsset = { url: `${BLOB}/silabus.pdf`, name: "Silabus.pdf", kind: "file", contentType: "application/pdf", size: 2_500_000, alt: "" };

describe("email assets", () => {
  it("only allows public Vercel Blob URLs", () => {
    expect(isAllowedAssetUrl(img.url)).toBe(true);
    expect(isAllowedAssetUrl("https://evil.example/x.jpg")).toBe(false);
    expect(isAllowedAssetUrl("http://abc.public.blob.vercel-storage.com/x.jpg")).toBe(false);
    expect(isAllowedAssetUrl("https://public.blob.vercel-storage.com.evil.com/x")).toBe(false);
  });

  it("validates kinds, counts and normalizes fields", () => {
    expect(parseEmailAssets([img, pdf]).map((a) => a.kind)).toEqual(["image", "file"]);
    expect(parseEmailAssets(undefined)).toEqual([]);
    expect(() => parseEmailAssets([{ ...img, contentType: "image/webp" }])).toThrow();
    expect(() => parseEmailAssets([{ ...img, url: "https://evil.example/a.jpg" }])).toThrow();
    expect(() => parseEmailAssets(Array.from({ length: 11 }, () => img))).toThrow();
    expect(parseEmailAssets([{ ...pdf, kind: "image" }])[0].kind).toBe("file");
  });

  it("falls back to the classic template", () => {
    expect(parseEmailDesign("bogus", []).template).toBe("classic");
    expect(parseEmailDesign("promo", []).template).toBe("promo");
  });
});

describe("templates", () => {
  for (const { id } of EMAIL_TEMPLATES) {
    it(`renders ${id} with content, images, attachments and unsubscribe`, () => {
      const html = renderEmailHtml(draft, { ctaUrl: CTA, mode: "broadcast", design: { template: id, assets: [img, img2, pdf] } });
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain("Paragraf dua.");
      expect(html).toContain(img.url);
      expect(html).toContain(img2.url);
      expect(html).toContain("Banner &lt;bootcamp&gt;");
      expect(html).toContain(`href="${pdf.url}"`);
      expect(html).toContain("Silabus.pdf");
      expect(html).toContain("2.4 MB");
      expect(html).toContain(`href="${CTA}"`);
      expect(html).toContain(UNSUBSCRIBE_PLACEHOLDER);
      expect(html).not.toMatch(/display:\s*(flex|grid)/);
    });
  }

  it("banner uses the first image as a full-width hero", () => {
    const html = renderEmailHtml(draft, { ctaUrl: CTA, mode: "preview", design: { template: "banner", assets: [img, img2] } });
    expect(html.indexOf(img.url)).toBeLessThan(html.indexOf("Saatnya kerja lebih cerdas"));
    expect(html).toContain('width="600"');
  });

  it("promo shows the CTA in the hero block", () => {
    const html = renderEmailHtml(draft, { ctaUrl: CTA, mode: "preview", design: { template: "promo", assets: [] } });
    expect(html.split(`href="${CTA}"`).length - 1).toBe(2);
  });

  it("lists files in the plain-text version", () => {
    expect(renderEmailText(draft, { ctaUrl: CTA, mode: "broadcast", design: { template: "classic", assets: [pdf] } })).toContain(
      `Silabus.pdf: ${pdf.url}`,
    );
  });

  it("binds the test token content to template and assets", () => {
    const base = canonicalEmail(draft, CTA, { template: "classic", assets: [img] });
    expect(canonicalEmail(draft, CTA, { template: "promo", assets: [img] })).not.toBe(base);
    expect(canonicalEmail(draft, CTA, { template: "classic", assets: [img, pdf] })).not.toBe(base);
    expect(canonicalEmail(draft, CTA, { template: "classic", assets: [{ ...img, alt: "lain" }] })).not.toBe(base);
  });
});
