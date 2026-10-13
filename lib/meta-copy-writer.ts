/**
 * Writes Ads Manager copy for a Meta Ads carousel with an OpenAI text model
 * (the user's own key), then verifies it and asks for one revision when the
 * verifier finds invented facts or overclaims.
 */
import "server-only";

import OpenAI from "openai";

import { PLANNER_MODELS, isFatal } from "@/lib/carousel-planner";
import { INTELLIGO_BRAND_SYSTEM, INTELLIGO_MARKETING_RULES } from "@/lib/intelligo-style";
import {
  CopyValidationError,
  META_COPY_LIMITS,
  copySource,
  type MetaCopyInput,
  META_CTA_BUTTONS,
  parseMetaAdCopy,
  verifyMetaAdCopy,
  type CopyIssue,
  type MetaAdCopy,
} from "@/lib/meta-copy";
import { createOpenAIClient } from "@/lib/openai";

const TIMEOUT_MS = 90_000;

export const META_COPY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["primaryTexts", "cards", "ctaButton", "ctaReason"],
  properties: {
    primaryTexts: { type: "array", items: { type: "string" } },
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "description"],
        properties: { headline: { type: "string" }, description: { type: "string" } },
      },
    },
    ctaButton: { type: "string", enum: [...META_CTA_BUTTONS] },
    ctaReason: { type: "string" },
  },
} as const;

export function buildCopyInstructions(): string {
  const { voice } = INTELLIGO_MARKETING_RULES;
  return [
    `You are a senior performance copywriter for ${INTELLIGO_BRAND_SYSTEM.name}, an Indonesian education and career-skills company (${INTELLIGO_BRAND_SYSTEM.positioning} ${INTELLIGO_BRAND_SYSTEM.promise}).`,
    "Write Meta Ads Manager copy for a carousel ad, in Bahasa Indonesia, natural and conversational for Indonesian audiences.",
    `FIELDS:
- primaryTexts: exactly ${META_COPY_LIMITS.primaryVariants} variants of the ad's primary text, each with a different angle (1: relatable pain point / hook, 2: concrete benefit / outcome, 3: curiosity or direct invitation). Put the hook in the first ~${META_COPY_LIMITS.primaryText} characters; each variant should ideally fit in ${META_COPY_LIMITS.primaryText} characters. Max 2 emojis, no hashtags.
- cards: one entry per carousel card, in order. headline ≤ ${META_COPY_LIMITS.headline} characters, description ≤ ${META_COPY_LIMITS.description} characters (may be empty). Each card's copy must match that card's role and on-image text without repeating it word for word.
- ctaButton: the single best standard Meta button for this campaign; ctaReason: one short sentence (Indonesian) explaining why.`,
    `FACTS (critical): ${INTELLIGO_MARKETING_RULES.noInvention} Never write URLs, prices, dates, discounts, percentages or numbers that are not in the brief.`,
    `VOICE: ${voice.tone.join(", ")}. Avoid ${voice.avoid.join(", ")}.`,
    "Respond only with JSON that matches the provided schema.",
  ].join("\n\n");
}

export function buildCopyInput(input: MetaCopyInput): string {
  const cards = input.slides
    .map((prompt, i) => {
      const t = input.texts[i];
      const onImage = t
        ? [t.headline && `headline "${t.headline}"`, t.supporting && `supporting "${t.supporting}"`, t.cta && `button "${t.cta}"`]
            .filter(Boolean)
            .join(", ")
        : "";
      return `Card ${i + 1}: ${prompt}${onImage ? `\n  On-image text: ${onImage}` : ""}`;
    })
    .join("\n");
  return [
    input.sharedContext ? `CAMPAIGN DIRECTION:\n${input.sharedContext}` : "",
    `CAROUSEL (${input.slides.length} cards):\n${cards}`,
    `Return exactly ${input.slides.length} card entries.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function requestCopy(client: OpenAI, model: string, input: string, cardCount: number, signal?: AbortSignal) {
  const response = await client.responses.create(
    {
      model,
      instructions: buildCopyInstructions(),
      input,
      max_output_tokens: 8_000,
      text: {
        format: {
          type: "json_schema",
          name: "meta_ad_copy",
          schema: META_COPY_SCHEMA as unknown as Record<string, unknown>,
          strict: true,
        },
      },
    },
    { signal, timeout: TIMEOUT_MS },
  );
  if (response.status === "incomplete" || !response.output_text) {
    throw new CopyValidationError("Incomplete copy");
  }
  return parseMetaAdCopy(JSON.parse(response.output_text), cardCount);
}

export class CopyUnavailableError extends Error {}

export interface MetaCopyResult {
  copy: MetaAdCopy;
  issues: CopyIssue[];
  model: string;
  revisions: number;
}

export async function writeMetaAdCopy(opts: {
  apiKey: string;
  input: MetaCopyInput;
  signal?: AbortSignal;
  /** Injected in tests. */
  client?: OpenAI;
}): Promise<MetaCopyResult> {
  const client = opts.client ?? createOpenAIClient(opts.apiKey);
  const source = copySource(opts.input);
  const prompt = buildCopyInput(opts.input);
  const cardCount = opts.input.slides.length;

  for (const model of PLANNER_MODELS) {
    let copy: MetaAdCopy;
    try {
      copy = await requestCopy(client, model, prompt, cardCount, opts.signal);
    } catch (err) {
      if (isFatal(err) || err instanceof OpenAI.APIUserAbortError || (err as Error).name === "AbortError") throw err;
      console.error("[meta-copy] model failed", {
        model,
        status: err instanceof OpenAI.APIError ? err.status : undefined,
        code: err instanceof OpenAI.APIError ? err.code : undefined,
      });
      continue;
    }

    let issues = verifyMetaAdCopy(copy, source);
    let revisions = 0;
    const errors = (list: CopyIssue[]) => list.filter((i) => i.severity === "error");
    if (errors(issues).length > 0) {
      try {
        const feedback = errors(issues)
          .map((i) => `- ${i.message}`)
          .join("\n");
        const revised = await requestCopy(
          client,
          model,
          `${prompt}\n\nYOUR PREVIOUS COPY:\n${JSON.stringify(copy)}\n\nThe verifier rejected it:\n${feedback}\n\nReturn the full corrected copy. Fix only what is listed.`,
          cardCount,
          opts.signal,
        );
        const revisedIssues = verifyMetaAdCopy(revised, source);
        revisions = 1;
        if (errors(revisedIssues).length <= errors(issues).length) {
          copy = revised;
          issues = revisedIssues;
        }
      } catch (err) {
        if (isFatal(err)) throw err;
      }
    }
    return { copy, issues, model, revisions };
  }
  throw new CopyUnavailableError("No text model available");
}
