/**
 * Template planner — the fallback when the OpenAI text model is unavailable.
 * Produces a fact-free plan from the story skeleton; marketers edit the copy
 * in the review step.
 */
import "server-only";

import { rolesForCount } from "@/lib/carousel";
import { detectAudiences, detectContentTypes, detectFunnelStage, extractExactText } from "@/lib/content-detection";
import type { CarouselPlan, CarouselSlidePlan, SlideRole } from "@/types/carousel";

const ROLE_COPY: Record<SlideRole, { headline: string; concept: string }> = {
  HOOK: {
    headline: "Pernah merasa begini?",
    concept: "Scroll-stopping cover: a relatable everyday moment that captures the audience's situation, with a bold headline zone.",
  },
  PROBLEM: {
    headline: "Masalahnya bukan kurang kerja keras",
    concept: "Visualize the real pain point empathetically — overload, confusion or wasted time — without exaggeration.",
  },
  INSIGHT: {
    headline: "Yang dibutuhkan: skill yang tepat",
    concept: "A clear 'aha' moment shown through a simple editorial diagram or a before/after contrast.",
  },
  SOLUTION: {
    headline: "Mulai dari skill yang praktis",
    concept: "Show the practical skill in action in a believable modern work or study setting.",
  },
  PROGRAM: {
    headline: "Belajar bareng Intelligo ID",
    concept: "Introduce the learning experience: focused, mentor-guided, hands-on practice — no invented details.",
  },
  BENEFITS: {
    headline: "Yang kamu dapatkan",
    concept: "Two or three clean benefit areas with minimal icons or small visuals, generous whitespace, no numbers.",
  },
  "OFFER / SCHEDULE": {
    headline: "Info program",
    concept: "Clean structured layout with clearly reserved, empty areas for offer and schedule details to be added in Canva.",
  },
  CTA: {
    headline: "Siap mulai?",
    concept: "One clear call-to-action block in orange, generous whitespace, calm confident closing visual.",
  },
};

const SUBJECTS = [
  "a young Indonesian professional at a modern desk",
  "close-up of hands working on a laptop with a clean dashboard",
  "minimal editorial diagram or icon composition",
  "two Indonesian colleagues collaborating at a whiteboard",
  "typography-led layout with a single small object",
  "an Indonesian university student studying in a bright space",
  "workspace still life: notebook, laptop and coffee",
  "clean CTA layout with an abstract navy-and-orange shape",
];

export function buildTemplatePlan(brief: string, slideCount: number): CarouselPlan {
  const roles = rolesForCount(slideCount);
  const exact = extractExactText(brief);
  const types = detectContentTypes(brief);
  const educational = types.includes("educational");

  const slides: CarouselSlidePlan[] = roles.map((role, i) => ({
    index: i + 1,
    role,
    // Quoted text from the brief takes priority, in order, from the first slide.
    headline: exact[i] ?? ROLE_COPY[role].headline,
    supportingText: "",
    visualConcept: `${ROLE_COPY[role].concept} Topic: ${brief.slice(0, 300)}`,
    subject: role === "CTA" ? SUBJECTS[7] : SUBJECTS[i % 7],
  }));

  return {
    topic: brief.slice(0, 200),
    audience: detectAudiences(brief).join(", ") || "Indonesian students, fresh graduates and professionals",
    funnelStage: detectFunnelStage(brief) ?? "cold",
    style: {
      artDirection: educational
        ? "Pale blue educational visual with navy diagrams and clean editorial illustration"
        : "White editorial layout with navy typography and a single orange accent",
      background: educational
        ? "Pale blue #EAF2F5 on content slides; navy #023047 on the cover and CTA slide"
        : "Off-white #F8FAFB on content slides; navy #023047 on the cover and CTA slide",
      typography: "Bold modern sans-serif headline in navy (white on navy slides), short regular-weight supporting line",
      layoutGrid: "Generous 8% margins, headline zone in the upper third, visual in the lower two thirds, top-left corner kept empty for the official logo",
      recurringMotif: "A thin orange accent line beside each headline",
    },
    slides,
  };
}
