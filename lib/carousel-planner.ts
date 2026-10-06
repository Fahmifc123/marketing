/**
 * CAROUSEL PLANNER — the "main agent".
 *
 * 1. Drafts the whole carousel (story, copy, shared style guide) with an
 *    OpenAI text model using structured outputs, with the user's own key.
 * 2. Runs the deterministic verifier on every slide.
 * 3. If blocking issues are found, asks the model to revise once.
 * 4. Falls back to the template planner if the text model is unavailable.
 *
 * Nothing is generated until the marketer approves the plan in the UI.
 */
import "server-only";

import OpenAI from "openai";

import { PlanValidationError, parseCarouselPlan, rolesForCount } from "@/lib/carousel";
import { buildTemplatePlan } from "@/lib/carousel-template";
import { hasBlockingIssues, verifyCarouselPlan } from "@/lib/carousel-verifier";
import {
  detectAudiences,
  detectFunnelStage,
  detectTopics,
  extractExactText,
  extractUrls,
} from "@/lib/content-detection";
import { INTELLIGO_BRAND_SYSTEM, INTELLIGO_CAROUSEL_PLANNER_RULES } from "@/lib/intelligo-style";
import { createOpenAIClient } from "@/lib/openai";
import { SLIDE_ROLES, type CarouselPlan, type PlanIssue, type PlanSource } from "@/types/carousel";
import type { ResolvedFormat } from "@/types/image";

/**
 * Text models tried in order. Override with CAROUSEL_PLANNER_MODEL
 * (comma-separated) when model names change.
 */
export const PLANNER_MODELS: string[] = (process.env.CAROUSEL_PLANNER_MODEL ?? "gpt-6-astra,gpt-5.5")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const PLANNER_TIMEOUT_MS = 90_000;

const stringField = { type: "string" } as const;

export const CAROUSEL_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["topic", "audience", "funnelStage", "style", "slides"],
  properties: {
    topic: stringField,
    audience: stringField,
    funnelStage: { type: "string", enum: ["cold", "warm", "retargeting"] },
    style: {
      type: "object",
      additionalProperties: false,
      required: ["artDirection", "background", "typography", "layoutGrid", "recurringMotif"],
      properties: {
        artDirection: stringField,
        background: stringField,
        typography: stringField,
        layoutGrid: stringField,
        recurringMotif: stringField,
      },
    },
    slides: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "role", "headline", "supportingText", "visualConcept", "subject"],
        properties: {
          index: { type: "integer" },
          role: { type: "string", enum: [...SLIDE_ROLES] },
          headline: stringField,
          supportingText: stringField,
          visualConcept: stringField,
          subject: stringField,
        },
      },
    },
  },
} as const;

export function buildPlannerInstructions(): string {
  const r = INTELLIGO_CAROUSEL_PLANNER_RULES;
  const list = (items: readonly string[]) => items.map((i) => `- ${i}`).join("\n");
  return [
    r.role,
    `Brand: ${INTELLIGO_BRAND_SYSTEM.name} — ${INTELLIGO_BRAND_SYSTEM.positioning} ${INTELLIGO_BRAND_SYSTEM.promise}`,
    `STORY:\n${list(r.story)}`,
    `COPY:\n${list(r.copy)}`,
    `FACTS (critical):\n- ${r.facts}`,
    `STYLE GUIDE:\n${list(r.style)}\nAvailable art directions:\n${list(INTELLIGO_BRAND_SYSTEM.artDirections)}`,
    `VISUALS:\n${list(r.visuals)}`,
    "Respond only with JSON that matches the provided schema.",
  ].join("\n\n");
}

export function buildPlannerInput(opts: {
  brief: string;
  slideCount: number;
  format: ResolvedFormat;
  hasReference: boolean;
}): string {
  const roles = rolesForCount(opts.slideCount);
  const exact = extractExactText(opts.brief);
  const urls = extractUrls(opts.brief);
  const audiences = detectAudiences(opts.brief);
  const funnel = detectFunnelStage(opts.brief);
  const topics = detectTopics(opts.brief);
  return [
    `BRIEF:\n"""\n${opts.brief}\n"""`,
    `SLIDES: exactly ${roles.length}, in this order: ${roles.map((r, i) => `${i + 1}. ${r}`).join(", ")}.`,
    `FORMAT: ${opts.format.label} ${opts.format.ratio}.`,
    audiences.length ? `Detected audience: ${audiences.join("; ")}.` : "",
    funnel ? `Detected funnel stage: ${funnel}.` : "Funnel stage not stated: choose the most fitting one.",
    topics.length ? `Detected topics: ${topics.join("; ")}.` : "",
    exact.length ? `Exact text to use verbatim: ${exact.map((t) => `"${t}"`).join(", ")}.` : "No exact text supplied.",
    urls.length ? `Supplied URLs (use exactly, only on the CTA slide if useful): ${urls.join(", ")}.` : "No URL supplied: do not use any URL.",
    opts.hasReference ? "A reference image is attached to every slide request (described in the brief)." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildRevisionInput(base: string, plan: CarouselPlan, issues: PlanIssue[]): string {
  const problems = issues
    .filter((i) => i.severity === "error")
    .map((i) => `- ${i.slideIndex ? `Slide ${i.slideIndex}` : "Plan"}: ${i.message}`)
    .join("\n");
  return `${base}\n\nYOUR PREVIOUS PLAN:\n${JSON.stringify(plan)}\n\nThe verifier rejected it:\n${problems}\n\nReturn the full corrected plan. Fix only what is listed; keep everything else.`;
}

/** Errors that make planning (and image generation) pointless. */
function isFatal(err: unknown): boolean {
  if (err instanceof OpenAI.AuthenticationError) return true;
  if (err instanceof OpenAI.APIError) {
    return err.code === "insufficient_quota" || err.code === "billing_hard_limit_reached";
  }
  return false;
}

async function requestPlan(
  client: OpenAI,
  model: string,
  input: string,
  slideCount: number,
  signal?: AbortSignal,
): Promise<CarouselPlan> {
  const response = await client.responses.create(
    {
      model,
      instructions: buildPlannerInstructions(),
      input,
      max_output_tokens: 16_000,
      text: {
        format: {
          type: "json_schema",
          name: "carousel_plan",
          schema: CAROUSEL_PLAN_SCHEMA as unknown as Record<string, unknown>,
          strict: true,
        },
      },
    },
    { signal, timeout: PLANNER_TIMEOUT_MS },
  );
  if (response.status === "incomplete" || !response.output_text) {
    throw new PlanValidationError("Planner returned an incomplete plan");
  }
  const plan = parseCarouselPlan(JSON.parse(response.output_text));
  if (plan.slides.length !== slideCount) {
    throw new PlanValidationError("Planner returned the wrong number of slides");
  }
  return plan;
}

export interface PlanResult {
  plan: CarouselPlan;
  issues: PlanIssue[];
  source: PlanSource;
  plannerModel: string | null;
  revisions: number;
  notices: string[];
}

export async function planCarousel(opts: {
  apiKey: string;
  brief: string;
  slideCount: number;
  format: ResolvedFormat;
  hasReference: boolean;
  signal?: AbortSignal;
  /** Injected in tests. */
  client?: OpenAI;
}): Promise<PlanResult> {
  const client = opts.client ?? createOpenAIClient(opts.apiKey);
  const input = buildPlannerInput(opts);
  const notices: string[] = [];

  for (const model of PLANNER_MODELS) {
    let plan: CarouselPlan;
    try {
      plan = await requestPlan(client, model, input, opts.slideCount, opts.signal);
    } catch (err) {
      if (isFatal(err) || (err as Error).name === "AbortError" || err instanceof OpenAI.APIUserAbortError) throw err;
      console.error(`[carousel-plan] planner model failed`, {
        model,
        status: err instanceof OpenAI.APIError ? err.status : undefined,
        code: err instanceof OpenAI.APIError ? err.code : undefined,
        error: err instanceof Error ? err.name : "unknown",
      });
      continue;
    }

    let issues = verifyCarouselPlan(plan, opts.brief);
    let revisions = 0;
    if (hasBlockingIssues(issues)) {
      try {
        const revised = await requestPlan(
          client,
          model,
          buildRevisionInput(input, plan, issues),
          opts.slideCount,
          opts.signal,
        );
        const revisedIssues = verifyCarouselPlan(revised, opts.brief);
        revisions = 1;
        if (revisedIssues.filter((i) => i.severity === "error").length <= issues.filter((i) => i.severity === "error").length) {
          plan = revised;
          issues = revisedIssues;
        }
      } catch (err) {
        if (isFatal(err)) throw err;
        notices.push("Revisi otomatis gagal — catatan verifikasi ditampilkan untuk dicek manual.");
      }
    }
    return { plan, issues, source: "llm", plannerModel: model, revisions, notices };
  }

  const plan = buildTemplatePlan(opts.brief, opts.slideCount);
  notices.push("Planner AI tidak tersedia untuk API key ini — rencana dibuat dari template. Edit copy tiap slide sebelum generate.");
  return {
    plan,
    issues: verifyCarouselPlan(plan, opts.brief),
    source: "template",
    plannerModel: null,
    revisions: 0,
    notices,
  };
}
