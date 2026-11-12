import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { DEFAULT_FORMAT, resolveFormat } from "@/lib/image-settings";
import { buildIntelligoPrompt } from "@/lib/prompt-builder";
import { isPrivateAddress } from "@/lib/remote-image";
import { classModeLines, parseSpeakers } from "@/lib/speakers";

const base = {
  userPrompt: "Promo Bootcamp AI Tools for Work Productivity, kelas online",
  model: "gpt-image-2.5-sunburst",
  quality: "high" as const,
  aspectRatio: resolveFormat({ formatId: DEFAULT_FORMAT, customRatio: { width: 1, height: 1 }, autoStory: false }),
};

describe("class mode", () => {
  it("parses speakers safely and pads to the photo count", () => {
    expect(parseSpeakers('[{"name":"  Budi  ","title":"CTO"}]', 2)).toEqual([
      { name: "Budi", title: "CTO" },
      { name: "", title: "" },
    ]);
    expect(parseSpeakers("not json", 1)).toEqual([{ name: "", title: "" }]);
  });

  it("tells the model to paste, not redraw, and counts after the reference", () => {
    const text = classModeLines([{ name: "Budi", title: "" }], 1).join("\n");
    expect(text).toMatch(/second attached image/);
    expect(text).toMatch(/do not redraw/i);
    expect(text).toMatch(/"Budi"/);
  });

  it("forbids invented faces when no photo is given", () => {
    expect(classModeLines([], 0).join(" ")).toMatch(/do NOT invent/);
  });

  it("adds the section only in class mode", () => {
    expect(buildIntelligoPrompt(base)).not.toMatch(/CLASS \/ PROGRAM/);
    const p = buildIntelligoPrompt({ ...base, contentMode: "class", speakers: [{ name: "", title: "" }], referenceImage: {} });
    expect(p).toMatch(/CLASS \/ PROGRAM/);
    expect(p).toMatch(/FIRST attached image is the reference/);
  });
});

describe("isPrivateAddress", () => {
  it("blocks internal ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });
});
