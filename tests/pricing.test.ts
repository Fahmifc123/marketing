import { describe, expect, it } from "vitest";

import { getModel, qualityForModel, sizeForModel } from "@/lib/image-settings";
import { actualImageCost, estimateImageCost, formatUsd } from "@/lib/pricing";

describe("pricing", () => {
  it("computes actual cost from usage tokens", () => {
    const c = actualImageCost("gpt-image-2", { inputTokens: 1000, imageTokens: 0, textTokens: 1000, outputTokens: 10000 })!;
    expect(c.usd).toBeCloseTo((1000 * 5 + 10000 * 30) / 1e6, 6);
    expect(c.verified).toBe(true);
  });
  it("flags 2.5 rates as unverified", () => {
    expect(actualImageCost("gpt-image-2.5-sunburst", { outputTokens: 1 })!.verified).toBe(false);
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
    expect(qualityForModel("gpt-image-1", "max")).toBe("high");
    expect(qualityForModel("gpt-image-2.5-sunburst", "max")).toBe("max");
    expect(sizeForModel("gpt-image-1-mini", { width: 1600, height: 2000 })).toEqual({ width: 1024, height: 1536 });
    expect(sizeForModel("gpt-image-2", { width: 1600, height: 2000 })).toEqual({ width: 1600, height: 2000 });
    expect(getModel("gpt-image-2")?.qualities).not.toContain("xhigh");
  });
});
