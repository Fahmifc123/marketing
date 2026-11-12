import { describe, expect, it } from "vitest";

import { getModel, qualityForModel, sizeForModel } from "@/lib/image-settings";
import { actualImageCost, calibrationKey, estimateImageCost, formatUsd } from "@/lib/pricing";

describe("pricing", () => {
  it("computes actual cost from usage tokens", () => {
    const c = actualImageCost("gpt-image-2", { inputTokens: 1000, imageTokens: 0, textTokens: 1000, outputTokens: 10000 })!;
    expect(c.usd).toBeCloseTo((1000 * 5 + 10000 * 30) / 1e6, 6);
    expect(c.verified).toBe(true);
  });
  it("matches OpenAI's published per-image prices for standard sizes", () => {
    const base = { promptChars: 0, referenceImages: 0, fullPrompt: true };
    const out = (model: string, quality: "low" | "medium" | "high", w: number, h: number) =>
      estimateImageCost({ ...base, model, quality, size: { width: w, height: h } }).usd;
    expect(out("gpt-image-2", "high", 1024, 1024)).toBeCloseTo(0.211, 3);
    expect(out("gpt-image-2", "high", 1024, 1536)).toBeCloseTo(0.165, 3);
    expect(out("gpt-image-1.5", "high", 1024, 1024)).toBeCloseTo(0.133, 3);
    expect(out("gpt-image-1-mini", "medium", 1024, 1536)).toBeCloseTo(0.0127, 3);
  });
  it("uses calibration learned from real usage", () => {
    const size = { width: 1600, height: 2000 };
    const cal = { [calibrationKey("gpt-image-2", "high", size)]: 1000 / (1600 * 2000) };
    const e = estimateImageCost({ model: "gpt-image-2", quality: "high", size, promptChars: 0, referenceImages: 0, fullPrompt: true, calibration: cal });
    expect(e.calibrated).toBe(true);
    expect(e.outTokens).toBe(1000);
  });
  it("estimates more for higher quality and bigger images", () => {
    const base = { model: "gpt-image-2", size: { width: 1024, height: 1024 }, promptChars: 400, referenceImages: 0 };
    const low = estimateImageCost({ ...base, quality: "low" }).usd;
    const high = estimateImageCost({ ...base, quality: "high" }).usd;
    const big = estimateImageCost({ ...base, quality: "high", size: { width: 2048, height: 2048 } }).usd;
    expect(low).toBeLessThan(high);
    expect(big).toBeGreaterThan(high * 3);
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(0.211)).toBe("$0.211");
  });
});

describe("model capabilities", () => {
  it("falls back to a supported quality and standard size for legacy models", () => {
    expect(qualityForModel("gpt-image-1.5", "max")).toBe("high");
    expect(getModel("gpt-image-1")).toBeUndefined(); // shut down by OpenAI on 2026-10-23
    expect(qualityForModel("gpt-image-2.5-sunburst", "max")).toBe("max");
    expect(sizeForModel("gpt-image-1-mini", { width: 1600, height: 2000 })).toEqual({ width: 1024, height: 1536 });
    expect(sizeForModel("gpt-image-2", { width: 1600, height: 2000 })).toEqual({ width: 1600, height: 2000 });
    expect(getModel("gpt-image-2")?.qualities).not.toContain("xhigh");
  });
});
