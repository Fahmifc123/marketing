/** Class / program creatives: speaker photos are pasted in as-is, never redrawn. */
export const SPEAKER_LIMITS = { max: 3, name: 60, title: 80 } as const;

export type ContentMode = "general" | "class";

export interface SpeakerInfo {
  name: string;
  title: string;
}

export function isContentMode(v: unknown): v is ContentMode {
  return v === "general" || v === "class";
}

/** Parses the `speakers` form field: JSON [{ name, title }]. */
export function parseSpeakers(raw: unknown, count: number): SpeakerInfo[] {
  let list: unknown = [];
  if (typeof raw === "string" && raw.length <= 4000) {
    try {
      list = JSON.parse(raw);
    } catch {
      list = [];
    }
  }
  const arr = Array.isArray(list) ? list : [];
  return Array.from({ length: count }, (_, i) => {
    const s = (arr[i] ?? {}) as Record<string, unknown>;
    const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
    return { name: clean(s.name, SPEAKER_LIMITS.name), title: clean(s.title, SPEAKER_LIMITS.title) };
  });
}

const ORD = ["first", "second", "third", "fourth", "fifth"];

/** Prompt lines for class mode. `firstIndex` is the 0-based position of the first speaker photo among attached images. */
export function classModeLines(speakers: SpeakerInfo[], firstIndex: number): string[] {
  const lines = [
    "This is a promo for an Intelligo ID class / program (bootcamp, webinar, workshop or course).",
    "Lay it out like a professional class poster: clear program title, key details only if given in the brief (date, time, format, benefits), and a prominent CTA.",
  ];
  if (speakers.length === 0) {
    lines.push("No speaker photos are provided: do NOT invent or draw any speaker, presenter or person's face; use typography, graphics or objects instead.");
    return lines;
  }
  const which = speakers.map((_, i) => `the ${ORD[firstIndex + i] ?? `#${firstIndex + i + 1}`} attached image`).join(", ");
  lines.push(
    `SPEAKER PHOTOS (${which}): these are real people. COMPOSITE them into the design — paste, do not redraw or re-imagine.`,
    "Preserve each person exactly as photographed: same face, identity, facial features, expression, skin tone, hair, glasses, hijab/headwear, clothing and pose.",
    "Do NOT beautify, retouch, slim, age, change gender or ethnicity, restyle, illustrate, cartoonize or regenerate the person. No added accessories.",
    "Allowed edits only: clean background removal / cut-out, cropping, uniform scaling, placement, and a subtle brand-colored frame, shape or shadow behind the cut-out.",
    "Keep every face fully visible and sharp; no text, logo or graphic may overlap a face.",
    `Show exactly ${speakers.length} speaker${speakers.length > 1 ? "s" : ""} — no extra people.`,
  );
  speakers.forEach((s, i) => {
    const label = [s.name, s.title].filter(Boolean).join(" — ");
    lines.push(
      label
        ? `Speaker ${i + 1} (${ORD[firstIndex + i]} attached image): add a clean name label near them with exactly this text: "${label}". Spell it exactly; no other title.`
        : `Speaker ${i + 1}: no name given — do not write any name or title for this person.`,
    );
  });
  return lines;
}
