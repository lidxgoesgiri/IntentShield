import "server-only";
import { enforceIntentGuards, sanitizeExplanation } from "@/features/intent/lib/normalize-intent";
import { ExplainResponseSchema, RawModelIntentSchema, type ExplainRequest } from "@/features/intent/schema";
import type { ParseIntentResponse } from "@/features/intent/types";
import { AiProviderError, createChatCompletion, extractJsonObject, type FetchLike } from "./client";
import type { AiConfig } from "./config";
import {
  buildExplainUserMessage,
  buildParseIntentUserMessage,
  EXPLAIN_JSON_SCHEMA,
  EXPLAIN_SYSTEM_PROMPT,
  PARSE_INTENT_JSON_SCHEMA,
  PARSE_INTENT_SYSTEM_PROMPT,
} from "./prompt";

export class AiInvalidOutputError extends Error {
  constructor() {
    super("AI returned output that failed validation.");
    this.name = "AiInvalidOutputError";
  }
}

const MAX_ATTEMPTS = 2; // first try + at most one retry for invalid JSON (PRD §9.3)

/**
 * Ask the model for a structured draft, validate it, and apply deterministic
 * guards. Throws AiProviderError (provider down/timeout) or AiInvalidOutputError
 * (still invalid after one retry) — callers fall back to manual entry.
 */
export async function parseIntentWithAi(
  text: string,
  config: AiConfig,
  options: { signal?: AbortSignal; fetchImpl?: FetchLike } = {},
): Promise<ParseIntentResponse> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const content = await createChatCompletion(
      config,
      {
        messages: [
          { role: "system", content: PARSE_INTENT_SYSTEM_PROMPT },
          { role: "user", content: buildParseIntentUserMessage(text) },
        ],
        jsonSchema: { name: "parse_intent", schema: PARSE_INTENT_JSON_SCHEMA },
        maxTokens: 300,
        ...(options.signal ? { signal: options.signal } : {}),
      },
      options.fetchImpl,
    );
    let candidate: unknown;
    try {
      candidate = extractJsonObject(content);
    } catch {
      continue;
    }
    const parsed = RawModelIntentSchema.safeParse(candidate);
    if (parsed.success) return enforceIntentGuards(parsed.data, text);
  }
  throw new AiInvalidOutputError();
}

const ABSOLUTE_CLAIMS = /(100\s*%|guarantee|risk[-\s]?free|completely safe|fully secure|totally safe|scam[-\s]?proof)/i;
const SIGN_ENCOURAGEMENT = /(safe to sign|go ahead and sign|you (?:can|should) sign|ok to sign|okay to sign)/i;

/**
 * Optional plain-language explanation of a deterministic verdict. The verdict
 * is supplied by the rule engine; explanations that overclaim or encourage
 * signing a blocked transaction are discarded (fail closed to no AI text).
 */
export async function explainVerificationWithAi(
  input: ExplainRequest,
  config: AiConfig,
  options: { signal?: AbortSignal; fetchImpl?: FetchLike } = {},
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const content = await createChatCompletion(
      config,
      {
        messages: [
          { role: "system", content: EXPLAIN_SYSTEM_PROMPT },
          { role: "user", content: buildExplainUserMessage(input) },
        ],
        jsonSchema: { name: "explain_verification", schema: EXPLAIN_JSON_SCHEMA },
        maxTokens: 220,
        ...(options.signal ? { signal: options.signal } : {}),
      },
      options.fetchImpl,
    );
    let candidate: unknown;
    try {
      candidate = extractJsonObject(content);
    } catch {
      continue;
    }
    const parsed = ExplainResponseSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const explanation = sanitizeExplanation(parsed.data.explanation, "", 600);
    if (!explanation) continue;
    if (ABSOLUTE_CLAIMS.test(explanation)) throw new AiInvalidOutputError();
    if (input.status !== "matched" && SIGN_ENCOURAGEMENT.test(explanation)) throw new AiInvalidOutputError();
    return explanation;
  }
  throw new AiInvalidOutputError();
}

export { AiProviderError };
