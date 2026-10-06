import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import { detectSlideCount, parseCarouselPlan, rolesForCount } from "@/lib/carousel";
import { planCarousel } from "@/lib/carousel-planner";
import { buildTemplatePlan } from "@/lib/carousel-template";
import { findUnsupportedFacts, hasBlockingIssues, verifyCarouselPlan } from "@/lib/carousel-verifier";
import { resolveFormat } from "@/lib/image-settings";
import { buildCarouselSlidePrompt } from "@/lib/prompt-builder";
import { crc32, createZip } from "@/lib/zip";
import type { CarouselPlan } from "@/types/carousel";

const format = resolveFormat({ formatId: "instagram-portrait" });
const BRIEF = "Carousel 4 slide kenapa karyawan perlu belajar AI tools, ajak ikut Bootcamp AI Tools";

function samplePlan(overrides: Partial<CarouselPlan["slides"][number]>[] = []): CarouselPlan {
  const roles = rolesForCount(4);
  return {
    topic: "AI tools untuk karyawan",
    audience: "working professionals",
    funnelStage: "cold",
    style: {
      artDirection: "White editorial layout",
      background: "Off-white with navy CTA slide",
      typography: "Bold sans-serif headline",
      layoutGrid: "8% margins, logo space top-left",
      recurringMotif: "Thin orange line",
    },
    slides: roles.map((role, i) => ({
      index: i + 1,
      role,
      headline: `Headline ${i + 1}`,
      supportingText: "",
      visualConcept: `Concept ${i + 1}`,
      subject: `subject ${i + 1}`,
      ...overrides[i],
    })),
  };
}

describe("carousel structure", () => {
  it("condenses the 8-step flow for smaller carousels", () => {
    expect(rolesForCount(3)).toEqual(["HOOK", "SOLUTION", "CTA"]);
    expect(rolesForCount(8)).toHaveLength(8);
    expect(rolesForCount(20)).toHaveLength(8);
    expect(rolesForCount(1)).toHaveLength(3);
    for (let n = 3; n <= 8; n++) {
      const roles = rolesForCount(n);
      expect(roles[0]).toBe("HOOK");
      expect(roles.at(-1)).toBe("CTA");
    }
  });

  it("detects the requested slide count", () => {
    expect(detectSlideCount("carousel 5 slide tentang AI")).toBe(5);
    expect(detectSlideCount("buat 12 slides")).toBe(8);
    expect(detectSlideCount("carousel tentang AI")).toBeNull();
  });

  it("validates untrusted plans and normalizes roles and numbering", () => {
    const raw = samplePlan();
    raw.slides[1].role = "CTA";
    raw.slides[1].index = 99;
    const plan = parseCarouselPlan(raw);
    expect(plan.slides[1]).toMatchObject({ index: 2, role: "PROBLEM" });
    expect(() => parseCarouselPlan({ ...raw, slides: raw.slides.slice(0, 2) })).toThrow();
    expect(() => parseCarouselPlan({ ...raw, style: { ...raw.style, artDirection: "" } })).toThrow();
    expect(() => parseCarouselPlan("nope")).toThrow();
  });
});

describe("carousel verifier", () => {
  it("passes a clean plan", () => {
    expect(verifyCarouselPlan(samplePlan(), BRIEF)).toEqual([]);
  });

  it("flags invented prices, dates, percentages and URLs", () => {
    expect(findUnsupportedFacts("Cuma Rp 1.489.000! Mulai 12 Januari, diskon 50%", BRIEF)).toEqual(
      expect.arrayContaining(["Rp 1.489.000", "12 Januari", "50%"]),
    );
    expect(findUnsupportedFacts("Daftar di intelligo.id/promo", BRIEF)).toContain("intelligo.id/promo");
    const issues = verifyCarouselPlan(samplePlan([{}, { headline: "Hemat 50% waktu kerja" }]), BRIEF);
    expect(issues).toContainEqual(expect.objectContaining({ slideIndex: 2, severity: "error", code: "unsupported_fact" }));
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it("accepts facts that come from the brief", () => {
    const brief = 'Carousel promo bootcamp, harga Rp 1.489.000, link intelligo.id/bc-ai-tools';
    expect(findUnsupportedFacts("Hanya Rp 1.489.000 di intelligo.id/bc-ai-tools", brief)).toEqual([]);
  });

  it("downgrades fact issues on slides the marketer edited", () => {
    const issues = verifyCarouselPlan(samplePlan([{ headline: "Rp 999.000 saja", edited: true }]), BRIEF);
    expect(issues).toContainEqual(expect.objectContaining({ slideIndex: 1, severity: "warning", code: "unsupported_fact" }));
  });

  it("flags overclaims, QR codes, logos, long headlines and repeated subjects", () => {
    const issues = verifyCarouselPlan(
      samplePlan([
        { headline: "Dijamin langsung kerja" },
        { visualConcept: "Add a QR code at the bottom" },
        { visualConcept: "Big Intelligo logo in the center", headline: "Ini headline yang sangat panjang sekali dan tidak akan muat di slide" },
        { subject: "subject 1" },
      ]),
      BRIEF,
    );
    const codes = issues.map((i) => `${i.slideIndex}:${i.code}`);
    expect(codes).toEqual(
      expect.arrayContaining(["1:overclaim", "2:qr_code", "3:logo", "3:long_headline", "4:repeated_subject"]),
    );
  });

  it("warns when quoted brief text is not used", () => {
    const issues = verifyCarouselPlan(samplePlan(), `${BRIEF} dengan headline "KERJA LEBIH CERDAS"`);
    expect(issues).toContainEqual(expect.objectContaining({ slideIndex: null, code: "missing_exact_text" }));
  });
});

describe("template planner", () => {
  it("produces a fact-free plan that passes the verifier", () => {
    for (let n = 3; n <= 8; n++) {
      const plan = buildTemplatePlan(BRIEF, n);
      expect(plan.slides).toHaveLength(n);
      expect(parseCarouselPlan(plan)).toBeTruthy();
      expect(hasBlockingIssues(verifyCarouselPlan(plan, BRIEF))).toBe(false);
    }
  });

  it("uses quoted text from the brief", () => {
    const plan = buildTemplatePlan('Carousel AI "KERJA LEBIH CERDAS"', 4);
    expect(plan.slides[0].headline).toBe("KERJA LEBIH CERDAS");
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

const notFound = () => OpenAI.APIError.generate(404, { error: { code: "model_not_found" } }, "not found", new Headers());

describe("planCarousel (main agent)", () => {
  const opts = { apiKey: "sk-test", brief: BRIEF, slideCount: 4, format, hasReference: false };

  it("returns a verified LLM plan", async () => {
    const { client, create } = fakeClient([JSON.stringify(samplePlan())]);
    const result = await planCarousel({ ...opts, client });
    expect(result.source).toBe("llm");
    expect(result.plannerModel).toBeTruthy();
    expect(result.issues).toEqual([]);
    expect(result.revisions).toBe(0);
    expect(create).toHaveBeenCalledTimes(1);
    const body = (create.mock.calls[0] as unknown[])[0] as { text: { format: { type: string; strict: boolean } } };
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
  });

  it("asks the model to revise once when the verifier finds errors", async () => {
    const bad = samplePlan([{}, { headline: "Diskon 50% hari ini" }]);
    const { client, create } = fakeClient([JSON.stringify(bad), JSON.stringify(samplePlan())]);
    const result = await planCarousel({ ...opts, client });
    expect(create).toHaveBeenCalledTimes(2);
    const revisionInput = ((create.mock.calls[1] as unknown[])[0] as { input: string }).input;
    expect(revisionInput).toContain("The verifier rejected it");
    expect(revisionInput).toContain("50%");
    expect(result.revisions).toBe(1);
    expect(result.issues).toEqual([]);
  });

  it("tries the next model, then falls back to the template", async () => {
    const { client, create } = fakeClient([notFound(), "not json", notFound()]);
    const result = await planCarousel({ ...opts, client });
    expect(result.source).toBe("template");
    expect(result.plan.slides).toHaveLength(4);
    expect(result.notices[0]).toMatch(/template/);
    expect(create.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back when the model returns the wrong number of slides", async () => {
    const short = samplePlan();
    short.slides = short.slides.slice(0, 3);
    const { client } = fakeClient([JSON.stringify(short), JSON.stringify(short), JSON.stringify(short)]);
    expect((await planCarousel({ ...opts, client })).source).toBe("template");
  });

  it("surfaces invalid API keys instead of hiding them behind the template", async () => {
    const auth = OpenAI.APIError.generate(401, { error: { code: "invalid_api_key" } }, "bad key", new Headers());
    const { client } = fakeClient([auth]);
    await expect(planCarousel({ ...opts, client })).rejects.toBeInstanceOf(OpenAI.AuthenticationError);
  });
});

describe("buildCarouselSlidePrompt", () => {
  const plan = samplePlan([{ headline: "KERJA MAKIN BANYAK" }, { supportingText: "Waktu terasa makin sedikit" }]);
  const build = (slideIndex: number, extra: { hasStyleAnchor?: boolean; hasReference?: boolean } = {}) =>
    buildCarouselSlidePrompt({
      brief: BRIEF,
      plan,
      slideIndex,
      quality: "high",
      aspectRatio: format,
      hasStyleAnchor: false,
      hasReference: false,
      ...extra,
    });

  it("renders one slide with the shared style guide and exact copy", () => {
    const p = build(1);
    expect(p).toMatch(/slide 1 of 4/);
    expect(p).toMatch(/Render ONLY this single slide/);
    expect(p).toContain("White editorial layout");
    expect(p).toContain("Thin orange line");
    expect(p).toContain('Headline: "KERJA MAKIN BANYAK"');
    expect(p).toMatch(/Slide role HOOK/);
    expect(p).toMatch(/swipe cue/);
    expect(p).toMatch(/NEVER create, recreate/);
  });

  it("references the style anchor only when attached", () => {
    expect(build(2)).not.toMatch(/FIRST attached image/);
    const p = build(2, { hasStyleAnchor: true });
    expect(p).toMatch(/FIRST attached image is slide 1/);
    expect(p).toMatch(/Do NOT copy its headline/);
  });

  it("has no swipe cue on the last slide", () => {
    expect(build(4)).toMatch(/Final slide: no swipe cue/);
  });
});

describe("zip", () => {
  it("computes standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes a valid stored archive", () => {
    const data = new TextEncoder().encode("hello");
    const zip = createZip([{ name: "01-hook.png", data }]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(zip.length - 22 + 10, true)).toBe(1);
    expect(zip.length).toBe(30 + 11 + 5 + 46 + 11 + 22);
  });
});
