/**
 * INTELLIGO ID STYLE ENGINE
 *
 * Brand rules used to turn a short brief into a complete image prompt.
 * This file is intentionally separate from API and UI logic so the marketing
 * team can refine the visual system without touching application code.
 *
 * Server-only: these internal prompts are never shipped to the browser.
 */
import "server-only";

import type { ContentType, FunnelStage } from "@/types/generation";

export const INTELLIGO_BRAND_SYSTEM = {
  name: "Intelligo ID",
  positioning: "Modern EdTech meets premium SaaS.",
  promise: "Practical skills for real-world careers.",
  pillars: ["Learn.", "Build.", "Grow."],
  personality: [
    "professional",
    "modern",
    "premium",
    "credible",
    "practical",
    "educational",
    "technology-focused",
    "career-oriented",
    "clean",
    "minimal",
    "editorial",
    "spacious",
  ],
  palette: {
    primary: { name: "Intelligo Navy", hex: "#023047" },
    navyShades: ["#1F4E63", "#3C6C7F", "#5A8A9B", "#77A8B7", "#94C6D3"],
    accent: { name: "Intelligo Orange", hex: "#FF5400" },
    orangeShades: ["#FF6A1F", "#FF803F", "#FF965F", "#FFAC7F", "#FFC29F"],
    neutrals: {
      white: "#FFFFFF",
      offWhite: "#F8FAFB",
      paleBlue: "#EAF2F5",
      gray: "#DCE5E9",
    },
  },
  designPrinciples: [
    "generous whitespace and breathing room",
    "strong, unambiguous visual hierarchy with one clear focal point",
    "clean modern sans-serif typography direction",
    "simple composition with few, purposeful elements",
    "professional photography or clean editorial illustration",
    "subtle, believable technology cues (screens, data, code, dashboards) — never sci-fi",
    "restrained, strategic use of orange for emphasis and calls to action",
    "a strong navy identity",
  ],
  /**
   * Art directions that all feel like Intelligo ID. Consistency comes from the
   * color system, spacing, typography and quality — not from repeating the
   * same person, layout, background or decorative shapes.
   */
  artDirections: [
    "White editorial layout with navy typography and a single orange accent",
    "Navy-dominant campaign visual with off-white type and an orange highlight",
    "Pale blue (#EAF2F5) educational visual with navy diagrams or illustration",
    "White + orange CTA-led layout with a bold call-to-action block",
    "Photography-led visual with a realistic Indonesian subject and a clean navy/white text area",
    "Typography-led visual where a bold headline is the hero",
    "Illustration-led visual using clean, minimal, vector-like editorial forms",
    "Split-screen comparison (before/after, problem/solution)",
  ],
} as const;

export const INTELLIGO_NEGATIVE_RULES: string[] = [
  "No visual clutter, no excessive cards, no excessive icons, no visual noise.",
  "No random 3D elements, no excessive floating objects.",
  "No childish education aesthetics (cartoon pencils, chalkboards, school clip-art).",
  "No cheap corporate poster aesthetics, no fake corporate handshakes, no generic stock-photo poses.",
  "No excessive gradients, no neon cyberpunk, no excessive glow or lens flares.",
  "No generic AI robot imagery, no humanoid robots, no glowing brains, no unrealistic holographic interfaces.",
  "No plastic skin, no unnatural faces, no distorted hands, no exaggerated smiles, no overly perfect models.",
  "No fabricated logos, brand marks, partner logos, certificates or badges.",
  "No invented prices, dates, schedules, discounts, statistics, testimonials, mentor credentials, student counts, placement rates or partnerships.",
  "No invented URLs, social handles, phone numbers or QR codes.",
  "No watermarks, no signatures, no lorem ipsum, no gibberish pseudo-text blocks.",
];

export const INTELLIGO_LOGO_RULES = {
  noReference: [
    "NEVER create, recreate, approximate or stylize the Intelligo ID logo or any brand mark.",
    "Leave clean, uncluttered space (top-left or top-right corner, roughly 15% of the width) for the official Intelligo ID logo to be added manually in Canva.",
    "Do not write the words \"Intelligo ID\" as a logo-like wordmark.",
  ],
  withReference: [
    "The reference image contains the OFFICIAL Intelligo ID logo.",
    "Reproduce it exactly as provided: do not alter its shape, proportions, colors, typography or symbol.",
    "Place it cleanly with enough clear space; never distort, recolor, outline or add effects to it.",
  ],
};

export const INTELLIGO_PEOPLE_RULES = {
  include: [
    "People: Indonesian / Southeast Asian students, fresh graduates, young professionals or working professionals.",
    "Natural, realistic, editorial, authentic — premium documentary-style photography in believable modern work or study environments.",
    "Natural anatomy, realistic skin texture, relaxed genuine expressions, correct hands and fingers.",
    "If several people appear, keep each person's appearance consistent. If the same person appears twice (e.g. split-screen), the face must be identical.",
  ],
  optional:
    "Include people only if they genuinely strengthen the message. Do not add people just for decoration; an object-, typography- or illustration-led composition is equally valid.",
};

export const INTELLIGO_TEXT_RULES = {
  base: [
    "AI-rendered typography can be inaccurate — prioritize visual quality over the amount of text.",
    "Keep on-image text minimal: one short headline and, at most, one short supporting line.",
    "Use clean, bold, modern sans-serif typography with correct spelling.",
    "If text accuracy matters, leave clean, well-defined space for typography to be added later in Canva.",
  ],
  noExactText:
    "No exact text was supplied: you may use one short, factual-free headline in Bahasa Indonesia that fits the brief (no numbers, prices, dates, claims or URLs), or leave clean headline space instead.",
  exactTextIntro: "Render this exact text verbatim — same spelling, capitalization and punctuation, nothing added:",
};

export const INTELLIGO_MARKETING_RULES = {
  voice: {
    tone: ["professional", "practical", "credible", "friendly", "modern", "career-oriented"],
    avoid: [
      "exaggerated hype",
      "fake urgency",
      "clickbait",
      "misleading promises",
      "\"guaranteed job\" or job-guarantee claims",
      "unrealistic income claims",
    ],
  },
  programs: [
    "Bootcamp",
    "Private Course",
    "Internship",
    "Job Ready",
    "Workshops",
    "Events",
    "Data Science",
    "Data Analytics",
    "Artificial Intelligence",
    "Machine Learning",
    "Python",
    "SQL",
    "Data Visualization",
    "AI Automation",
    "Portfolio development",
  ],
  noInvention:
    "Only use facts supplied in the brief. Never invent program prices, schedules, dates, discounts, testimonials, mentor credentials, student counts, placement rates, company logos, partnerships or statistics. If the brief does not supply a detail, leave it out.",
  funnel: {
    cold: "COLD audience: lead with a relatable hook, then problem → insight → solution. Do not open with a generic program poster. Example headline direction: \"KERJAAN MAKIN BANYAK. WAKTU TERASA MAKIN SEDIKIT.\" — then position the skill as the solution.",
    warm: "WARM audience: the program can be the hero — benefits, curriculum, mentor, schedule and a clear CTA, using only details supplied in the brief.",
    retargeting: "RETARGETING audience: emphasize the offer, schedule and a clear registration CTA, with honest (never fake) urgency, using only details supplied in the brief.",
  } satisfies Record<FunnelStage, string>,
  defaultFunnel:
    "Funnel stage not specified: for promotional posters treat the audience as warm; for educational or social content treat it as cold and lead with a relatable hook.",
};

export const CAROUSEL_FLOW = [
  "HOOK",
  "PROBLEM",
  "INSIGHT",
  "SOLUTION",
  "PROGRAM",
  "BENEFITS",
  "OFFER / SCHEDULE",
  "CTA",
] as const;

export const CONTENT_TYPE_DIRECTIONS: Record<ContentType, string[]> = {
  poster: [
    "Marketing poster logic: a strong headline area, clear visual hierarchy, program identity, one supporting visual, a concise value statement, a clear CTA area and space for the logo.",
    "Do not overload with information. Leave out any price, date, discount or registration link not supplied in the brief.",
  ],
  carousel: [
    "Carousel logic: this image is one slide of a cohesive story-driven carousel (flow: HOOK → PROBLEM → INSIGHT → SOLUTION → PROGRAM → BENEFITS → OFFER / SCHEDULE → CTA).",
    "Generate only the single slide described here — not a grid or a collage of slides.",
    "Design it so following slides could share the same grid, margins and typography system while using different visual subjects.",
  ],
  story: [
    "Instagram Story logic: full-bleed vertical 9:16 composition with one bold focal point.",
    "Keep the top ~14% and bottom ~20% free of critical text or faces (Instagram UI overlays).",
  ],
  educational: [
    "Educational visual logic: explain one idea clearly. Use simple diagrams, structured layouts or a calm learning scene.",
    "Credible and practical, never childish. Favor pale blue and white backgrounds with navy structure.",
  ],
  recruitment: [
    "Recruitment creative logic: an inviting, credible employer-brand visual. Clear role title area, a sense of the work environment and culture, and a CTA area.",
    "Do not invent requirements, salaries, benefits, deadlines or application links.",
  ],
  event: [
    "Event promotion logic: clear event title area, an atmosphere of the session (stage, workshop, collaborative learning), and reserved space for date/time/location details supplied in the brief.",
    "Do not invent dates, venues, speakers or ticket prices.",
  ],
  campaign: [
    "Campaign logic: a distinctive, ownable visual idea that could extend across a series while staying fresh — not a generic program poster.",
  ],
  social: [
    "Social media visual logic: thumb-stopping at small sizes — one bold focal point, high contrast, minimal text.",
  ],
  general: [
    "General visual: interpret the brief with a premium, editorial Intelligo ID art direction and one clear focal point.",
  ],
};

export const CAROUSEL_SLIDE_GUIDANCE: Record<string, string> = {
  HOOK: "Slide role HOOK (cover): a bold, relatable headline area and an intriguing visual that makes people swipe. No product details yet.",
  PROBLEM: "Slide role PROBLEM: visualize the audience's real pain point in a believable, empathetic way.",
  INSIGHT: "Slide role INSIGHT: a clear 'aha' idea — simple diagram, contrast or reframing.",
  SOLUTION: "Slide role SOLUTION: show the practical skill or approach that solves the problem.",
  PROGRAM: "Slide role PROGRAM: introduce the Intelligo ID program as the vehicle for that solution (use only supplied details).",
  BENEFITS: "Slide role BENEFITS: 2–3 concise benefit areas with clean icons or visuals — no invented numbers.",
  "OFFER / SCHEDULE": "Slide role OFFER / SCHEDULE: clean reserved areas for offer and schedule details supplied in the brief (leave placeholders empty if not supplied).",
  CTA: "Slide role CTA: one clear call to action, generous whitespace and space for the logo.",
};

export const INTELLIGO_QUALITY_RULES = {
  photography: [
    "Photorealistic, high detail, realistic natural lighting, professional art direction, editorial photography.",
    "Accurate object relationships and perspective; natural human anatomy.",
  ],
  illustration: [
    "For illustration: clean modern editorial illustration, minimal vector-like forms, professional EdTech aesthetic — never generic AI art.",
  ],
};

export const REFERENCE_IMAGE_RULES = {
  layout: "Preserve the reference's layout, grid and composition while replacing the content as requested.",
  person: "Preserve the reference person's identity and appearance (face, hair, skin tone, build) accurately.",
  logo: "The reference contains the official Intelligo ID logo — reproduce it exactly without alteration.",
  style: "Use the reference only as visual inspiration (mood, lighting, palette, art direction); create an original composition in the Intelligo ID visual system.",
  product: "Represent the referenced product/object accurately (shape, proportions, details).",
  general:
    "Use the reference as visual direction for composition and subject while applying the Intelligo ID visual system. Do not copy third-party logos or text from it.",
};
