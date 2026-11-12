/**
 * Writes marketing email content with an OpenAI text model (the user's own
 * key), verifies it against the brief, and asks for one revision when it
 * finds invented facts or overclaims.
 */
import "server-only";

import OpenAI from "openai";

import { PLANNER_MODELS, isFatal } from "@/lib/carousel-planner";
import {
  EMAIL_LIMITS,
  EMAIL_TYPES,
  EmailValidationError,
  parseEmailDraft,
  verifyEmailDraft,
  type EmailDraft,
  type EmailIssue,
  type EmailType,
} from "@/lib/email-content";
import { INTELLIGO_BRAND_SYSTEM, INTELLIGO_MARKETING_RULES } from "@/lib/intelligo-style";
import { createOpenAIClient } from "@/lib/openai";

const TIMEOUT_MS = 90_000;

export const EMAIL_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "preheader", "heading", "paragraphs", "ctaLabel", "closing"],
  properties: {
    subject: { type: "string" },
    preheader: { type: "string" },
    heading: { type: "string" },
    paragraphs: { type: "array", items: { type: "string" } },
    ctaLabel: { type: "string" },
    closing: { type: "string" },
  },
} as const;

export function buildEmailInstructions(): string {
  const { voice } = INTELLIGO_MARKETING_RULES;
  return [
    `You are the email marketing copywriter for ${INTELLIGO_BRAND_SYSTEM.name}, an Indonesian education and career-skills company (${INTELLIGO_BRAND_SYSTEM.positioning} ${INTELLIGO_BRAND_SYSTEM.promise}).`,
    "Write one marketing email in natural Bahasa Indonesia (friendly 'kamu' voice) that people actually want to read: clear value, short paragraphs, scannable.",
    `FIELDS:
- subject: ideally ≤ ${EMAIL_LIMITS.subject} characters, specific and honest, no ALL CAPS, max 1 emoji, no spam words like "GRATIS!!!".
- preheader: ≤ ${EMAIL_LIMITS.preheader} characters, complements the subject (does not repeat it).
- heading: short headline at the top of the email.
- paragraphs: 2–4 short paragraphs (2–3 sentences each). Plain text, no markdown, no HTML.
- ctaLabel: 2–4 word button text. Use an empty string if no CTA link was provided.
- closing: one short sign-off line (e.g. "Salam hangat,\\nTim Intelligo ID").`,
    `FACTS (critical): ${INTELLIGO_MARKETING_RULES.noInvention} Never write prices, dates, discounts, percentages, numbers, URLs or names that are not in the brief. Do not paste URLs into the text — the CTA button carries the link.`,
    `VOICE: ${voice.tone.join(", ")}. Avoid ${voice.avoid.join(", ")}.`,
    "Respond only with JSON that matches the provided schema.",
  ].join("\n\n");
}

export interface EmailWriteInput {
  brief: string;
  emailType: EmailType;
  ctaUrl: string;
}

export function emailSource(input: EmailWriteInput): string {
  return [input.brief, input.ctaUrl].filter(Boolean).join("\n");
}

export function buildEmailInput(input: EmailWriteInput): string {
  const type = EMAIL_TYPES.find((t) => t.id === input.emailType)?.label ?? input.emailType;
  return [
    `EMAIL TYPE: ${type}`,
    `BRIEF:\n"""\n${input.brief}\n"""`,
    input.ctaUrl ? `CTA LINK (already set on the button): ${input.ctaUrl}` : "No CTA link: set ctaLabel to an empty string.",
  ].join("\n\n");
}

async function requestDraft(client: OpenAI, model: string, input: string, signal?: AbortSignal): Promise<EmailDraft> {
  const response = await client.responses.create(
    {
      model,
      instructions: buildEmailInstructions(),
      input,
      max_output_tokens: 8_000,
      text: {
        format: {
          type: "json_schema",
          name: "email_draft",
          schema: EMAIL_DRAFT_SCHEMA as unknown as Record<string, unknown>,
          strict: true,
        },
      },
    },
    { signal, timeout: TIMEOUT_MS },
  );
  if (response.status === "incomplete" || !response.output_text) throw new EmailValidationError("Incomplete draft");
  return parseEmailDraft(JSON.parse(response.output_text));
}

export class EmailWriterUnavailableError extends Error {}

export interface EmailWriteResult {
  draft: EmailDraft;
  issues: EmailIssue[];
  model: string;
  revisions: number;
}

export async function writeEmailDraft(opts: {
  apiKey: string;
  input: EmailWriteInput;
  signal?: AbortSignal;
  /** Injected in tests. */
  client?: OpenAI;
}): Promise<EmailWriteResult> {
  const client = opts.client ?? createOpenAIClient(opts.apiKey);
  const source = emailSource(opts.input);
  const prompt = buildEmailInput(opts.input);
  const errors = (list: EmailIssue[]) => list.filter((i) => i.severity === "error");

  for (const model of PLANNER_MODELS) {
    let draft: EmailDraft;
    try {
      draft = await requestDraft(client, model, prompt, opts.signal);
    } catch (err) {
      if (isFatal(err) || err instanceof OpenAI.APIUserAbortError || (err as Error).name === "AbortError") throw err;
      console.error("[email-writer] model failed", {
        model,
        status: err instanceof OpenAI.APIError ? err.status : undefined,
        code: err instanceof OpenAI.APIError ? err.code : undefined,
      });
      continue;
    }
    if (!opts.input.ctaUrl) draft = { ...draft, ctaLabel: "" };

    let issues = verifyEmailDraft(draft, source);
    let revisions = 0;
    if (errors(issues).length > 0) {
      try {
        const feedback = errors(issues).map((i) => `- ${i.message}`).join("\n");
        let revised = await requestDraft(
          client,
          model,
          `${prompt}\n\nYOUR PREVIOUS DRAFT:\n${JSON.stringify(draft)}\n\nThe verifier rejected it:\n${feedback}\n\nReturn the full corrected draft. Fix only what is listed.`,
          opts.signal,
        );
        if (!opts.input.ctaUrl) revised = { ...revised, ctaLabel: "" };
        const revisedIssues = verifyEmailDraft(revised, source);
        revisions = 1;
        if (errors(revisedIssues).length <= errors(issues).length) {
          draft = revised;
          issues = revisedIssues;
        }
      } catch (err) {
        if (isFatal(err)) throw err;
      }
    }
    return { draft, issues, model, revisions };
  }
  throw new EmailWriterUnavailableError("No text model available");
}
