/**
 * PROMPT BUILDER
 *
 * Turns a short natural-language brief ("Poster promo Bootcamp AI Tools untuk
 * karyawan") into a complete internal image prompt that applies the Intelligo
 * ID visual system. Uses lightweight keyword heuristics — no external LLM.
 *
 * Server-only: the internal prompt is never exposed to the browser except to
 * authenticated users in Developer Mode.
 */
import "server-only";

import {
  detectAudiences,
  detectContentTypes,
  detectFunnelStage,
  detectReferenceIntents,
  detectSlideNumber,
  detectTopics,
  extractExactText,
  extractUrls,
  mentionsPeople,
  mentionsQrCode,
} from "@/lib/content-detection";
import {
  CAROUSEL_FLOW,
  CAROUSEL_SLIDE_GUIDANCE,
  CONTENT_TYPE_DIRECTIONS,
  INTELLIGO_BRAND_SYSTEM,
  INTELLIGO_LOGO_RULES,
  INTELLIGO_MARKETING_RULES,
  INTELLIGO_NEGATIVE_RULES,
  INTELLIGO_PEOPLE_RULES,
  INTELLIGO_QUALITY_RULES,
  INTELLIGO_TEXT_RULES,
  REFERENCE_IMAGE_RULES,
} from "@/lib/intelligo-style";
import type { CarouselPlan } from "@/types/carousel";
import type { CampaignContext, ContentType, FunnelStage } from "@/types/generation";
import type { QualityId, ResolvedFormat } from "@/types/image";

export interface BuildPromptInput {
  userPrompt: string;
  model: string;
  quality: QualityId;
  aspectRatio: ResolvedFormat;
  referenceImage?: { name?: string } | null;
  campaignContext?: CampaignContext;
}

export interface BriefAnalysis {
  contentTypes: ContentType[];
  funnelStage: FunnelStage | null;
  audiences: string[];
  topics: string[];
  exactText: string[];
  urls: string[];
  wantsQrCode: boolean;
  wantsPeople: boolean;
  slideNumber: number | null;
}

export function analyzeBrief(userPrompt: string, campaignContext?: CampaignContext): BriefAnalysis {
  return {
    contentTypes: detectContentTypes(userPrompt),
    funnelStage: campaignContext?.funnelStage ?? detectFunnelStage(userPrompt),
    audiences: detectAudiences(userPrompt),
    topics: detectTopics(userPrompt),
    exactText: extractExactText(userPrompt),
    urls: extractUrls(userPrompt),
    wantsQrCode: mentionsQrCode(userPrompt),
    wantsPeople: mentionsPeople(userPrompt),
    slideNumber: detectSlideNumber(userPrompt),
  };
}

const bullet = (lines: readonly string[]) => lines.map((l) => `- ${l}`).join("\n");

function section(title: string, body: string) {
  return `${title.toUpperCase()}:\n${body}`;
}

function describeOrientation(format: ResolvedFormat) {
  const { width, height } = format.generationSize;
  if (width === height) return "square";
  return width > height ? "horizontal" : "vertical";
}

function qualityDirection(quality: QualityId) {
  switch (quality) {
    case "max":
      return "Maximum fidelity: crisp fine detail, refined materials and textures, flawless edges.";
    case "xhigh":
      return "Very high fidelity: crisp detail and refined textures.";
    default:
      return "High fidelity: clean, sharp and production-ready.";
  }
}

export function buildIntelligoPrompt(input: BuildPromptInput): string {
  const userPrompt = input.userPrompt.trim();
  const brief = analyzeBrief(userPrompt, input.campaignContext);
  const { palette } = INTELLIGO_BRAND_SYSTEM;
  const format = input.aspectRatio;
  const hasReference = Boolean(input.referenceImage);
  const parts: string[] = [];

  // 1. Role + user intent
  parts.push(
    `Create a premium, modern EdTech marketing visual for ${INTELLIGO_BRAND_SYSTEM.name}, an Indonesian education and career-skills company.`,
  );
  parts.push(
    section(
      "Creative brief (from the marketing team — this is the primary intent; follow it faithfully)",
      `"""\n${userPrompt}\n"""`,
    ),
  );

  // 2–3. Visual identity + palette
  parts.push(
    section(
      "Visual identity",
      bullet([
        `Positioning: ${INTELLIGO_BRAND_SYSTEM.positioning} ${INTELLIGO_BRAND_SYSTEM.promise}`,
        `Feel: ${INTELLIGO_BRAND_SYSTEM.personality.join(", ")}.`,
        `Underlying message: ${INTELLIGO_BRAND_SYSTEM.pillars.join(" ")}`,
      ]),
    ),
  );
  parts.push(
    section(
      "Brand palette",
      bullet([
        `Primary navy ${palette.primary.hex} — the dominant brand color.`,
        `Supporting navy shades: ${palette.navyShades.join(", ")}.`,
        `Accent orange ${palette.accent.hex} — use strategically for emphasis and the call to action only; never dominant.`,
        `Orange tints (sparingly): ${palette.orangeShades.join(", ")}.`,
        `Neutrals: white ${palette.neutrals.white}, off-white ${palette.neutrals.offWhite}, pale blue ${palette.neutrals.paleBlue}, light gray ${palette.neutrals.gray}.`,
        "Avoid colors outside this system except natural tones in photography.",
      ]),
    ),
  );

  // 4. Design language + art direction variety
  parts.push(
    section(
      "Design language",
      bullet([
        ...INTELLIGO_BRAND_SYSTEM.designPrinciples.map((p) => p.charAt(0).toUpperCase() + p.slice(1) + "."),
        "Choose the ONE art direction below that best serves this brief. Do not default to \"navy background + orange button + person with laptop\" — every campaign should feel fresh while clearly belonging to Intelligo ID:",
        ...INTELLIGO_BRAND_SYSTEM.artDirections.map((d) => `  • ${d}`),
      ]),
    ),
  );

  // 5. Audience context
  const audiences = [
    ...(input.campaignContext?.audience ? [input.campaignContext.audience] : []),
    ...brief.audiences,
  ];
  parts.push(
    section(
      "Audience",
      audiences.length > 0
        ? `${audiences.join("; ")} in Indonesia. Make the visual instantly relatable to them.`
        : "Indonesian students, fresh graduates and working professionals building practical, career-relevant skills (infer the most relevant group from the brief).",
    ),
  );

  if (brief.topics.length > 0) {
    parts.push(
      section(
        "Subject matter",
        `${brief.topics.join("; ")}. Use subtle, believable technology cues that fit this topic (real screens, data, code or dashboards seen naturally) — never sci-fi.`,
      ),
    );
  }

  // 6. Marketing objective + content type logic
  const contentLines = brief.contentTypes.flatMap((t) => CONTENT_TYPE_DIRECTIONS[t]);
  if (brief.contentTypes.includes("carousel")) {
    const slide = brief.slideNumber ?? 1;
    const role = CAROUSEL_FLOW[Math.min(slide, CAROUSEL_FLOW.length) - 1];
    contentLines.push(`This is slide ${slide} of the carousel. ${CAROUSEL_SLIDE_GUIDANCE[role]}`);
  }
  const funnelLine = brief.funnelStage
    ? INTELLIGO_MARKETING_RULES.funnel[brief.funnelStage]
    : INTELLIGO_MARKETING_RULES.defaultFunnel;
  const objectiveLines = [
    ...(input.campaignContext?.objective ? [`Campaign objective: ${input.campaignContext.objective}`] : []),
    ...(input.campaignContext?.offer ? [`Approved offer details: ${input.campaignContext.offer}`] : []),
    funnelLine,
    ...contentLines,
    `Voice: ${INTELLIGO_MARKETING_RULES.voice.tone.join(", ")}. Avoid ${INTELLIGO_MARKETING_RULES.voice.avoid.join(", ")}.`,
  ];
  parts.push(section("Marketing objective & content logic", bullet(objectiveLines)));

  // 7–8. Composition + aspect ratio
  const { width, height } = format.generationSize;
  const compositionLines = [
    `Aspect ratio ${format.ratio} (${describeOrientation(format)}), composed natively for this frame at ${width}x${height}px.`,
    format.exportSize
      ? `Final design target: ${format.exportSize.width}x${format.exportSize.height}px (${format.label}). Keep key content inside a safe margin of ~6% from every edge so it can be resized or cropped in Canva.`
      : "Keep key content inside a safe margin of ~6% from every edge so it can be resized or cropped later.",
    "One clear focal point, intentional negative space, balanced alignment and a clear reading order.",
    qualityDirection(input.quality),
  ];
  parts.push(section("Composition & format", bullet(compositionLines)));

  // People / photography
  parts.push(
    section(
      "People & imagery",
      bullet([
        ...(brief.wantsPeople ? INTELLIGO_PEOPLE_RULES.include : [INTELLIGO_PEOPLE_RULES.optional, ...INTELLIGO_PEOPLE_RULES.include]),
        ...INTELLIGO_QUALITY_RULES.photography,
        ...INTELLIGO_QUALITY_RULES.illustration,
      ]),
    ),
  );

  // 9. Typography constraints
  const textLines = [...INTELLIGO_TEXT_RULES.base];
  if (brief.exactText.length > 0) {
    textLines.push(INTELLIGO_TEXT_RULES.exactTextIntro);
    textLines.push(...brief.exactText.map((t) => `  • "${t}"`));
    textLines.push("Do not add any other text beyond the exact text above, apart from no-fact labels essential to the layout.");
  } else {
    textLines.push(INTELLIGO_TEXT_RULES.noExactText);
  }
  if (brief.urls.length > 0) {
    textLines.push(`If a URL is shown, use exactly: ${brief.urls.map((u) => `"${u}"`).join(", ")} — character for character. No other URLs.`);
  } else {
    textLines.push("No URL was supplied: do not show any URL, website address or social handle.");
  }
  if (brief.wantsQrCode) {
    textLines.push(
      "A QR code was requested: leave a clean, empty square placeholder area (white with a thin subtle border) where the verified QR code will be inserted manually. Do NOT draw any QR pattern.",
    );
  } else {
    textLines.push("Do not include any QR code.");
  }
  textLines.push(INTELLIGO_MARKETING_RULES.noInvention);
  parts.push(section("Typography & text", bullet(textLines)));

  // 10. Logo rules
  const referenceIntents = hasReference ? detectReferenceIntents(userPrompt) : [];
  const logoReferenced = referenceIntents.includes("logo");
  parts.push(
    section("Logo", bullet(logoReferenced ? INTELLIGO_LOGO_RULES.withReference : INTELLIGO_LOGO_RULES.noReference)),
  );

  // 12. Reference image instructions
  if (hasReference) {
    parts.push(
      section(
        "Reference image",
        bullet([
          "A reference image is attached.",
          ...referenceIntents.map((intent) => REFERENCE_IMAGE_RULES[intent]),
          "Apply the reference only as described above; everything else follows the Intelligo ID visual system and the brief.",
        ]),
      ),
    );
  }

  // 11. Negative constraints
  parts.push(section("Avoid", bullet(INTELLIGO_NEGATIVE_RULES)));

  parts.push(`Aspect ratio: ${format.ratio}.`);

  return parts.join("\n\n");
}

export interface BuildSlidePromptInput {
  brief: string;
  plan: CarouselPlan;
  slideIndex: number;
  quality: QualityId;
  aspectRatio: ResolvedFormat;
  /** True when slide 1 (the approved cover) is attached as a style reference. */
  hasStyleAnchor: boolean;
  /** True when the marketer attached their own reference image. */
  hasReference: boolean;
}

/**
 * Builds the internal prompt for one slide of an approved carousel plan.
 * Every slide shares the plan's style guide so slides generated in parallel
 * still read as one series.
 */
export function buildCarouselSlidePrompt(input: BuildSlidePromptInput): string {
  const { plan, aspectRatio: format } = input;
  const slide = plan.slides.find((s) => s.index === input.slideIndex);
  if (!slide) throw new Error(`Slide ${input.slideIndex} not found`);
  const total = plan.slides.length;
  const brief = analyzeBrief(input.brief);
  const { palette } = INTELLIGO_BRAND_SYSTEM;
  const isLast = slide.index === total;
  const parts: string[] = [];

  parts.push(
    `Create slide ${slide.index} of ${total} of a cohesive Instagram carousel for ${INTELLIGO_BRAND_SYSTEM.name}, an Indonesian education and career-skills company. Render ONLY this single slide — not a grid, collage or multiple slides.`,
  );
  parts.push(section("Original brief (context for the whole series)", `"""\n${input.brief.trim()}\n"""`));
  parts.push(
    section(
      "Series",
      bullet([
        `Topic: ${plan.topic || "see brief"}.`,
        `Audience: ${plan.audience || "Indonesian learners and professionals"}.`,
        INTELLIGO_MARKETING_RULES.funnel[plan.funnelStage],
        `Story flow: ${plan.slides.map((s) => `${s.index}. ${s.role}`).join(" → ")}. This slide is ${slide.index}. ${slide.role}.`,
      ]),
    ),
  );
  parts.push(
    section(
      "Shared style guide — identical on every slide of this series",
      bullet([
        `Art direction: ${plan.style.artDirection}`,
        `Background: ${plan.style.background}`,
        `Typography: ${plan.style.typography}`,
        `Layout grid: ${plan.style.layoutGrid}`,
        `Recurring motif: ${plan.style.recurringMotif}`,
        "Keep margins, text position, type style and color balance consistent with the rest of the series.",
      ]),
    ),
  );
  parts.push(
    section(
      "This slide",
      bullet([
        CAROUSEL_SLIDE_GUIDANCE[slide.role],
        `Visual concept: ${slide.visualConcept}`,
        slide.subject ? `Main subject: ${slide.subject}. Use a subject different from the other slides.` : "",
        !isLast ? "Add a subtle swipe cue (small arrow or edge continuation) toward the next slide." : "Final slide: no swipe cue.",
      ].filter(Boolean)),
    ),
  );

  const textLines = [...INTELLIGO_TEXT_RULES.base];
  if (slide.headline || slide.supportingText) {
    textLines.push(INTELLIGO_TEXT_RULES.exactTextIntro);
    if (slide.headline) textLines.push(`  • Headline: "${slide.headline}"`);
    if (slide.supportingText) textLines.push(`  • Supporting line: "${slide.supportingText}"`);
    textLines.push("Do not add any other words, numbers, page counters, URLs or handles.");
  } else {
    textLines.push("No text on this slide: leave a clean, empty headline zone (per the layout grid) for Canva typography.");
  }
  textLines.push(
    brief.urls.length > 0
      ? `Only if a URL is part of the text above, render it exactly: ${brief.urls.map((u) => `"${u}"`).join(", ")}.`
      : "Do not show any URL, website address or social handle.",
  );
  textLines.push(
    brief.wantsQrCode && isLast
      ? "A QR code was requested: leave a clean empty square placeholder for the verified QR code. Do NOT draw any QR pattern."
      : "Do not include any QR code.",
  );
  textLines.push(INTELLIGO_MARKETING_RULES.noInvention);
  parts.push(section("Typography & text", bullet(textLines)));

  parts.push(
    section(
      "Brand palette",
      bullet([
        `Navy ${palette.primary.hex} dominant; supporting navy shades ${palette.navyShades.join(", ")}.`,
        `Orange ${palette.accent.hex} only as accent / CTA (tints ${palette.orangeShades.slice(0, 3).join(", ")}).`,
        `Neutrals: ${Object.values(palette.neutrals).join(", ")}.`,
      ]),
    ),
  );
  parts.push(
    section(
      "People & imagery",
      bullet([INTELLIGO_PEOPLE_RULES.optional, ...INTELLIGO_PEOPLE_RULES.include, ...INTELLIGO_QUALITY_RULES.photography, ...INTELLIGO_QUALITY_RULES.illustration]),
    ),
  );

  const logoReferenced = input.hasReference && detectReferenceIntents(input.brief).includes("logo");
  parts.push(section("Logo", bullet(logoReferenced ? INTELLIGO_LOGO_RULES.withReference : INTELLIGO_LOGO_RULES.noReference)));

  const referenceLines: string[] = [];
  if (input.hasStyleAnchor) {
    referenceLines.push(
      "The FIRST attached image is slide 1 (the approved cover) of this same series. Match its typography style, margins, grid, color balance and recurring motif exactly.",
      "Do NOT copy its headline, its subject or its composition — create a new composition for this slide's own content.",
    );
  }
  if (input.hasReference) {
    referenceLines.push(
      `${input.hasStyleAnchor ? "The LAST attached image" : "The attached image"} is the marketer's reference.`,
      ...detectReferenceIntents(input.brief).map((intent) => REFERENCE_IMAGE_RULES[intent]),
    );
  }
  if (referenceLines.length > 0) parts.push(section("Reference images", bullet(referenceLines)));

  const { width, height } = format.generationSize;
  parts.push(
    section(
      "Composition & format",
      bullet([
        `Aspect ratio ${format.ratio} (${describeOrientation(format)}), composed natively at ${width}x${height}px.`,
        format.exportSize
          ? `Final design target ${format.exportSize.width}x${format.exportSize.height}px. Keep key content ~6% away from every edge.`
          : "Keep key content ~6% away from every edge.",
        qualityDirection(input.quality),
      ]),
    ),
  );
  parts.push(section("Avoid", bullet(INTELLIGO_NEGATIVE_RULES)));
  parts.push(`Aspect ratio: ${format.ratio}.`);
  return parts.join("\n\n");
}
