/**
 * Lightweight keyword heuristics that interpret a natural-language brief.
 * No external LLM is used for classification.
 *
 * Shared by the server prompt builder and the UI (for hints such as the
 * automatic 9:16 Story format). Contains no internal prompt text.
 */
import type { ContentType, FunnelStage } from "@/types/generation";

function matcher(terms: string[]): RegExp {
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${escaped.join("|")})(?=$|[^\\p{L}\\p{N}])`, "iu");
}

const CONTENT_TYPE_PATTERNS: Array<[ContentType, RegExp]> = [
  ["carousel", matcher(["carousel", "carrousel", "karosel", "slide", "slides", "slider"])],
  ["story", matcher(["story", "stories", "ig story", "instagram story", "insta story", "reels cover"])],
  [
    "recruitment",
    matcher([
      "recruitment",
      "open recruitment",
      "oprec",
      "hiring",
      "we're hiring",
      "we are hiring",
      "lowongan",
      "loker",
      "rekrutmen",
      "join our team",
      "vacancy",
    ]),
  ],
  ["event", matcher(["event", "webinar", "workshop", "seminar", "acara", "talkshow", "meetup", "festival"])],
  [
    "educational",
    matcher(["educational", "edukasi", "edukatif", "learning", "materi", "belajar", "tips", "tutorial", "infografis", "infographic"]),
  ],
  ["poster", matcher(["poster", "promo", "promotion", "promosi", "flyer", "pamflet", "banner", "brosur"])],
  ["campaign", matcher(["campaign", "kampanye", "ads", "iklan"])],
  ["social", matcher(["instagram", "ig", "feed", "post", "postingan", "linkedin", "tiktok", "konten", "content", "sosmed", "social media"])],
];

export function detectContentTypes(prompt: string): ContentType[] {
  const types = CONTENT_TYPE_PATTERNS.filter(([, re]) => re.test(prompt)).map(([type]) => type);
  return types.length > 0 ? types : ["general"];
}

export function isStoryPrompt(prompt: string): boolean {
  return detectContentTypes(prompt).includes("story");
}

const FUNNEL_PATTERNS: Array<[FunnelStage, RegExp]> = [
  [
    "retargeting",
    matcher(["retargeting", "remarketing", "last chance", "kesempatan terakhir", "deadline", "segera daftar", "slot terbatas", "kuota terbatas", "closing", "hari terakhir"]),
  ],
  ["cold", matcher(["cold", "awareness", "cold audience", "hook", "problem", "masalah", "pain point", "relatable"])],
  ["warm", matcher(["warm", "warm audience", "benefit", "manfaat", "kurikulum", "curriculum", "mentor", "jadwal", "schedule", "harga", "price", "pendaftaran", "registration", "daftar"])],
];

export function detectFunnelStage(prompt: string): FunnelStage | null {
  for (const [stage, re] of FUNNEL_PATTERNS) {
    if (re.test(prompt)) return stage;
  }
  return null;
}

const AUDIENCE_PATTERNS: Array<[string, RegExp]> = [
  ["working professionals and employees", matcher(["karyawan", "pegawai", "pekerja", "employee", "employees", "professional", "professionals", "profesional", "orang kantoran", "corporate"])],
  ["fresh graduates", matcher(["fresh graduate", "fresh graduates", "fresh grad", "freshgrad", "lulusan", "lulusan baru"])],
  ["university students", matcher(["mahasiswa", "student", "students", "pelajar", "kampus"])],
  ["job seekers", matcher(["job seeker", "job seekers", "pencari kerja", "jobseeker", "cari kerja"])],
  ["career switchers", matcher(["career switcher", "career switch", "pindah karir", "pindah karier", "switch career", "alih karir"])],
  ["business owners and teams", matcher(["umkm", "business owner", "pemilik bisnis", "entrepreneur", "founder", "tim marketing", "marketing team"])],
];

export function detectAudiences(prompt: string): string[] {
  return AUDIENCE_PATTERNS.filter(([, re]) => re.test(prompt)).map(([label]) => label);
}

const TOPIC_PATTERNS: Array<[string, RegExp]> = [
  ["artificial intelligence and AI tools", matcher(["ai", "artificial intelligence", "ai tools", "chatgpt", "genai", "generative ai", "kecerdasan buatan"])],
  ["AI automation and workflow automation", matcher(["automation", "otomasi", "otomatisasi", "workflow", "ai automation", "n8n", "zapier"])],
  ["data science", matcher(["data science", "data scientist"])],
  ["data analytics", matcher(["data analytics", "data analyst", "analisis data", "analytics"])],
  ["machine learning", matcher(["machine learning", "ml", "deep learning"])],
  ["Python programming", matcher(["python"])],
  ["SQL and databases", matcher(["sql", "database", "query"])],
  ["data visualization and dashboards", matcher(["data visualization", "visualisasi data", "dashboard", "tableau", "power bi", "looker"])],
  ["portfolio development", matcher(["portfolio", "portofolio"])],
  ["career development", matcher(["career", "karir", "karier", "job ready", "interview", "cv", "resume"])],
];

export function detectTopics(prompt: string): string[] {
  return TOPIC_PATTERNS.filter(([, re]) => re.test(prompt)).map(([label]) => label);
}

const PEOPLE_PATTERN = matcher([
  "orang",
  "person",
  "people",
  "wanita",
  "pria",
  "perempuan",
  "laki-laki",
  "mahasiswa",
  "karyawan",
  "mentor",
  "trainer",
  "tim",
  "team",
  "wajah",
  "face",
]);

export function mentionsPeople(prompt: string): boolean {
  return PEOPLE_PATTERN.test(prompt);
}

/** Extracts text the user wants rendered exactly, e.g. "BELAJAR AI" or “Daftar Sekarang”. */
export function extractExactText(prompt: string): string[] {
  const results = new Set<string>();
  const re = /"([^"\n]{1,200})"|“([^”\n]{1,200})”|«([^»\n]{1,200})»/g;
  for (const m of prompt.matchAll(re)) {
    const text = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (text) results.add(text);
  }
  return [...results];
}

/** Extracts URLs or bare domains exactly as typed, e.g. intelligo.id/bc-ai-tools. */
export function extractUrls(prompt: string): string[] {
  const re = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:id|com|co|io|ai|net|org|me|link|ly|app|dev)(?:\/[^\s"'”),]*)?/gi;
  return [...new Set(prompt.match(re) ?? [])].map((u) => u.replace(/[.,;:!?]+$/, ""));
}

export function mentionsQrCode(prompt: string): boolean {
  return matcher(["qr", "qr code", "qrcode", "kode qr"]).test(prompt);
}

export function mentionsLogo(prompt: string): boolean {
  return matcher(["logo", "logomark", "brand mark"]).test(prompt);
}

/** Slide number requested for a carousel, e.g. "slide 3" or "slide ke-3". */
export function detectSlideNumber(prompt: string): number | null {
  const m = prompt.match(/slide\s*(?:ke[-\s]?)?(\d{1,2})\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 20 ? n : null;
}

export type ReferenceIntent = "layout" | "person" | "logo" | "style" | "product" | "general";

export function detectReferenceIntents(prompt: string): ReferenceIntent[] {
  const intents: ReferenceIntent[] = [];
  if (matcher(["layout", "tata letak", "komposisi", "composition", "struktur", "template", "desain ini", "design ini", "seperti ini"]).test(prompt)) intents.push("layout");
  if (matcher(["orang ini", "person", "wajah", "face", "model ini", "this person", "sosok", "orang yang sama", "same person"]).test(prompt)) intents.push("person");
  if (mentionsLogo(prompt)) intents.push("logo");
  if (matcher(["style", "gaya", "inspirasi", "inspiration", "mood", "vibe", "nuansa", "tone"]).test(prompt)) intents.push("style");
  if (matcher(["produk", "product", "mockup", "sertifikat", "certificate"]).test(prompt)) intents.push("product");
  return intents.length > 0 ? intents : ["general"];
}
