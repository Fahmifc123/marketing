/**
 * CAROUSEL VERIFIER
 *
 * Deterministic checks the main agent runs on every slide before anything is
 * generated. Rule-based on purpose: fast, predictable and unable to
 * hallucinate. Shared with the browser so edits are re-verified live.
 */
import { extractExactText, extractUrls, mentionsLogo, mentionsQrCode } from "@/lib/content-detection";
import type { CarouselPlan, CarouselSlidePlan, PlanIssue } from "@/types/carousel";

const MONTHS =
  "jan(?:uari|uary)?|feb(?:ruari|ruary)?|mar(?:et|ch)?|apr(?:il)?|mei|may|jun(?:i|e)?|jul(?:i|y)?|agu(?:stus)?|aug(?:ust)?|sep(?:tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|des(?:ember)?|dec(?:ember)?";

/** Facts that must come from the brief: prices, percentages, dates, large numbers, handles. */
const FACT_PATTERNS: RegExp[] = [
  /\b(?:rp|idr)\.?\s?\d[\d.,]*(?:\s?(?:rb|ribu|jt|juta|k))?/gi,
  /\$\s?\d[\d.,]*/g,
  /\b\d+(?:[.,]\d+)?\s?%/g,
  new RegExp(`\\b\\d{1,2}\\s+(?:${MONTHS})\\b(?:\\s+\\d{4})?`, "gi"),
  /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g,
  /\b\d{1,3}(?:[.,]\d{3})+\b|\b\d{2,}\b/g,
  /(?:^|\s)@[a-z0-9_.]{3,}/gi,
];

const CLAIM_PATTERN =
  /\b(?:dijamin|garansi(?: kerja)?|guaranteed?|pasti (?:diterima|kerja|dapat kerja|lolos)|terbaik(?: no\.? ?1)?|nomor satu|number one|#1|100% (?:kerja|lulus|berhasil))\b/i;

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "");

function slideText(slide: CarouselSlidePlan) {
  return `${slide.headline}\n${slide.supportingText}`;
}

export function findUnsupportedFacts(text: string, brief: string): string[] {
  const nb = normalize(brief);
  const found = new Set<string>();
  for (const re of FACT_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const token = m[0].trim();
      if (token && !nb.includes(normalize(token))) found.add(token);
    }
  }
  for (const url of extractUrls(text)) {
    if (!nb.includes(normalize(url))) found.add(url);
  }
  // A large number inside an already-flagged price/date should not be reported twice.
  const list = [...found];
  return list.filter((t) => !list.some((o) => o !== t && o.includes(t)));
}

export function verifyCarouselPlan(plan: CarouselPlan, brief: string): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const briefMentionsLogo = mentionsLogo(brief);
  const briefMentionsQr = mentionsQrCode(brief);
  const seenSubjects = new Map<string, number>();

  for (const slide of plan.slides) {
    const at = slide.index;
    const add = (severity: PlanIssue["severity"], code: string, message: string) =>
      issues.push({ slideIndex: at, severity, code, message });

    // 1. No invented facts. Marketer-edited slides are their own input → warning only.
    const facts = findUnsupportedFacts(slideText(slide), brief);
    if (facts.length > 0) {
      add(
        slide.edited ? "warning" : "error",
        "unsupported_fact",
        `Fakta yang tidak ada di brief: ${facts.join(", ")}. Pastikan benar atau hapus.`,
      );
    }
    const claim = slideText(slide).match(CLAIM_PATTERN);
    if (claim && !new RegExp(claim[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(brief)) {
      add(slide.edited ? "warning" : "error", "overclaim", `Klaim berlebihan: "${claim[0]}". Hindari janji yang tidak resmi.`);
    }

    // 2. QR codes and logos are never drawn by the model.
    const allText = `${slideText(slide)} ${slide.visualConcept} ${slide.subject}`;
    if (!briefMentionsQr && mentionsQrCode(allText)) {
      add("error", "qr_code", "QR code tidak diminta di brief. Hapus dari slide ini.");
    }
    if (!briefMentionsLogo && mentionsLogo(`${slide.visualConcept} ${slide.subject}`)) {
      add("warning", "logo", "Logo tidak perlu digambar — ruang logo resmi disiapkan otomatis.");
    }

    // 3. Text must stay short enough to render cleanly.
    const words = slide.headline.split(/\s+/).filter(Boolean).length;
    if (!slide.headline) {
      add("warning", "empty_headline", "Headline kosong — area teks dibiarkan kosong untuk diisi di Canva.");
    } else if (words > 10 || slide.headline.length > 70) {
      add("warning", "long_headline", `Headline terlalu panjang (${words} kata). Idealnya ≤ 8 kata agar teks rapi.`);
    }
    if (slide.supportingText.length > 160) {
      add("warning", "long_supporting", "Teks pendukung terlalu panjang. Persingkat agar tidak salah ketik di gambar.");
    }

    // 4. Varied subjects across slides (people-consistency rule).
    const subjectKey = slide.subject.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (subjectKey) {
      const first = seenSubjects.get(subjectKey);
      if (first !== undefined) {
        add("warning", "repeated_subject", `Subjek sama dengan slide ${first}. Gunakan subjek visual yang berbeda.`);
      } else {
        seenSubjects.set(subjectKey, at);
      }
    }
  }

  // 5. Exact text the marketer quoted in the brief should appear somewhere.
  const allSlideText = plan.slides.map(slideText).join("\n").toLowerCase();
  for (const text of extractExactText(brief)) {
    if (!allSlideText.includes(text.toLowerCase())) {
      issues.push({
        slideIndex: null,
        severity: "warning",
        code: "missing_exact_text",
        message: `Teks dari brief belum dipakai: "${text}".`,
      });
    }
  }

  return issues;
}

export function hasBlockingIssues(issues: PlanIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
