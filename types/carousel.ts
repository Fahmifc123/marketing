import type { FunnelStage } from "./generation";

export const SLIDE_ROLES = [
  "HOOK",
  "PROBLEM",
  "INSIGHT",
  "SOLUTION",
  "PROGRAM",
  "BENEFITS",
  "OFFER / SCHEDULE",
  "CTA",
] as const;

export type SlideRole = (typeof SLIDE_ROLES)[number];

/** Shared visual system applied to every slide of one carousel. */
export interface CarouselStyleGuide {
  artDirection: string;
  background: string;
  typography: string;
  layoutGrid: string;
  recurringMotif: string;
}

export interface CarouselSlidePlan {
  /** 1-based slide number. */
  index: number;
  role: SlideRole;
  /** Exact on-slide headline (may be empty → leave space for Canva). */
  headline: string;
  /** Exact on-slide supporting line (may be empty). */
  supportingText: string;
  /** Art direction for the image model (English). */
  visualConcept: string;
  /** Main visual subject — should differ between slides. */
  subject: string;
  /** True once the marketer edited this slide in the review step. */
  edited?: boolean;
}

export interface CarouselPlan {
  topic: string;
  audience: string;
  funnelStage: FunnelStage;
  style: CarouselStyleGuide;
  slides: CarouselSlidePlan[];
}

export type PlanSource = "llm" | "template";

export interface PlanIssue {
  /** null → applies to the whole plan. */
  slideIndex: number | null;
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface CarouselPlanResponse {
  ok: true;
  plan: CarouselPlan;
  issues: PlanIssue[];
  source: PlanSource;
  plannerModel: string | null;
  /** How many automatic revision rounds the planner ran. */
  revisions: number;
  notices: string[];
}

export type SlideJobStatus = "queued" | "generating" | "done" | "error";
