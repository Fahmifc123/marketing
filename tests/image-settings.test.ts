import { describe, expect, it } from "vitest";

import {
  FORMAT_PRESETS,
  SIZE_RULES,
  isValidCustomRatio,
  resolveFormat,
  sizeForRatio,
  standardSizeFor,
} from "@/lib/image-settings";
import type { Dimensions } from "@/types/image";

function expectValidSize({ width, height }: Dimensions) {
  expect(width % SIZE_RULES.multiple).toBe(0);
  expect(height % SIZE_RULES.multiple).toBe(0);
  expect(width / height).toBeGreaterThanOrEqual(SIZE_RULES.minRatio);
  expect(width / height).toBeLessThanOrEqual(SIZE_RULES.maxRatio);
  expect(Math.max(width, height)).toBeLessThanOrEqual(SIZE_RULES.maxEdge);
  expect(width * height).toBeLessThanOrEqual(SIZE_RULES.targetPixels);
}

describe("format presets", () => {
  it("all request valid, non-experimental sizes", () => {
    for (const preset of FORMAT_PRESETS) expectValidSize(preset.generationSize);
  });

  it("keeps generation size separate from the final export size", () => {
    const portrait = resolveFormat({ formatId: "instagram-portrait" });
    expect(portrait.ratio).toBe("4:5");
    expect(portrait.exportSize).toEqual({ width: 1080, height: 1350 });
    expect(portrait.generationSize.width).toBeGreaterThan(1080);
    expect(portrait.generationSize.width / portrait.generationSize.height).toBeCloseTo(0.8, 2);
  });
});

describe("custom ratios", () => {
  it.each([
    [1, 1],
    [3, 4],
    [2, 3],
    [21, 9],
    [3, 1],
    [1, 3],
    [7, 5],
  ])("computes a valid size for %i:%i", (w, h) => {
    const size = sizeForRatio({ width: w, height: h });
    expectValidSize(size);
    expect(size.width / size.height).toBeCloseTo(w / h, 1);
  });

  it("rejects ratios outside 1:3 – 3:1", () => {
    expect(isValidCustomRatio({ width: 4, height: 1 })).toBe(false);
    expect(isValidCustomRatio({ width: 1, height: 4 })).toBe(false);
    expect(isValidCustomRatio({ width: 0, height: 1 })).toBe(false);
    expect(isValidCustomRatio({ width: 16, height: 9 })).toBe(true);
  });
});

describe("resolveFormat", () => {
  it("switches story prompts to 9:16 automatically", () => {
    const format = resolveFormat({ formatId: "instagram-portrait", autoStory: true });
    expect(format.id).toBe("instagram-story");
    expect(format.ratio).toBe("9:16");
    expect(format.autoSelected).toBe(true);
  });

  it("resolves custom ratios", () => {
    const format = resolveFormat({ formatId: "custom", customRatio: { width: 6, height: 8 } });
    expect(format.ratio).toBe("3:4");
    expectValidSize(format.generationSize);
  });

  it("maps any size to the nearest standard fallback", () => {
    expect(standardSizeFor({ width: 1600, height: 2000 })).toEqual({ width: 1024, height: 1536 });
    expect(standardSizeFor({ width: 2560, height: 1440 })).toEqual({ width: 1536, height: 1024 });
    expect(standardSizeFor({ width: 1920, height: 1920 })).toEqual({ width: 1024, height: 1024 });
  });
});
