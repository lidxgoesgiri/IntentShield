import "server-only";
import { enforceIntentGuards, sanitizeExplanation } from "@/features/intent/lib/normalize-intent";
import { RawModelExplanationSchema, RawModelIntentSchema, type ExplainRequest } from "@/features/intent/schema";
import type { AiCallMeta, ParseIntentResponse } from "@/features/intent/types";
import { AiProviderError, AI_TIMEOUT_MS, createChatCompletion, extractJsonObject, type FetchLike } from "./client";
import type { AiConfig } from "./config";
import { resolveModelChain, type ModelHealth } from "./models";
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

export class AiUnsupportedModelError extends Error {
  constructor() {
    super("The requested AI model is not in the server allowlist.");
    this.name = "AiUnsupportedModelError";
  }
}

/** Whole-request deadline across the primary attempt and its fallback. */
export const AI_TOTAL_BUDGET_MS = 18_000;
const MIN_ATTEMPT_MS = 2_500;

export type AiRunOptions = Readonly<{
  /** Model id requested by the browser; validated against the allowlist. */
  model?: string | null;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
  health?: ModelHealth;
  /** Called before every provider call; return false to stop (budget exhausted). */
  consumeBudget?: () => boolean;
  now?: () => number;
}>;

/**
 * Try the requested model, then one fallback (PRD: at most one retry, then the
 * manual flow). `attempt` returns null for output that fails validation.
 * Provider failures put the model on a short cooldown.
 */
async function runWithModelFallback<T>(
  config: AiConfig,
  options: AiRunOptions,
  attempt: (model: string, timeoutMs: number) => Promise<T | null>,
): Promise<{ value: T; meta: AiCallMeta }> {
  const plan = resolveModelChain(config, options.model, options.health);
  if (!plan.ok) {
    if (plan.reason === "UNSUPPORTED_MODEL") throw new AiUnsupportedModelError();
    throw new AiProviderError("not_configured", "AI provider is not configured.");
  }

  const now = options.now ?? Date.now;
  const deadline = now() + AI_TOTAL_BUDGET_MS;
  let lastError: Error = new AiInvalidOutputError();

  for (const model of plan.chain) {
    const remaining = deadline - now();
    if (remaining < MIN_ATTEMPT_MS) break;
    if (options.consumeBudget && !options.consumeBudget()) {
      throw new AiProviderError("unavailable", "Daily AI budget exhausted.");
    }
    try {
      const value = await attempt(model, Math.min(AI_TIMEOUT_MS, remaining));
      if (value !== null) {
        options.health?.markSuccess(model);
        return {
          value,
          meta: { model, requestedModel: plan.requestedModel, fallbackUsed: model !== plan.requestedModel },
        };
      }
      lastError = new AiInvalidOutputError();
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (error instanceof AiProviderError) {
        if (error.kind === "not_configured") throw error;
        options.health?.markFailure(model);
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Ask the model for a structured draft, validate it, and apply deterministic
 * guards — the same guards whichever model answered. Throws AiProviderError
 * (provider down/timeout/empty), AiInvalidOutputError (invalid after the
 * fallback), or AiUnsupportedModelError (model not allowlisted).
 */
export async function parseIntentWithAi(
  text: string,
  config: AiConfig,
  options: AiRunOptions = {},
): Promise<{ result: ParseIntentResponse; meta: AiCallMeta }> {
  const { value, meta } = await runWithModelFallback(config, options, async (model, timeoutMs) => {
    const content = await createChatCompletion(
      config,
      {
        model,
        messages: [
          { role: "system", content: PARSE_INTENT_SYSTEM_PROMPT },
          { role: "user", content: buildParseIntentUserMessage(text) },
        ],
        jsonSchema: { name: "parse_intent", schema: PARSE_INTENT_JSON_SCHEMA },
        maxTokens: 900,
        timeoutMs,
        ...(options.signal ? { signal: options.signal } : {}),
      },
      options.fetchImpl,
    );
    let candidate: unknown;
    try {
      candidate = extractJsonObject(content);
    } catch {
      return null;
    }
    const parsed = RawModelIntentSchema.safeParse(candidate);
    return parsed.success ? enforceIntentGuards(parsed.data, text) : null;
  });
  return { result: value, meta };
}

const ABSOLUTE_CLAIMS = /(100\s*%|guarantee|risk[-\s]?free|completely safe|fully secure|totally safe|scam[-\s]?proof)/i;
const SIGN_ENCOURAGEMENT = /(safe to sign|go ahead and sign|you (?:can|should) sign|ok to sign|okay to sign)/i;

/**
 * Optional plain-language explanation of a deterministic verdict. Output that
 * overclaims or encourages signing a blocked transaction is discarded (the
 * fallback model may answer instead; otherwise no AI text is shown).
 */
export async function explainVerificationWithAi(
  input: ExplainRequest,
  config: AiConfig,
  options: AiRunOptions = {},
): Promise<{ explanation: string; meta: AiCallMeta }> {
  const { value, meta } = await runWithModelFallback(config, options, async (model, timeoutMs) => {
    const content = await createChatCompletion(
      config,
      {
        model,
        messages: [
          { role: "system", content: EXPLAIN_SYSTEM_PROMPT },
          { role: "user", content: buildExplainUserMessage(input) },
        ],
        jsonSchema: { name: "explain_verification", schema: EXPLAIN_JSON_SCHEMA },
        maxTokens: 700,
        timeoutMs,
        ...(options.signal ? { signal: options.signal } : {}),
      },
      options.fetchImpl,
    );
    let candidate: unknown;
    try {
      candidate = extractJsonObject(content);
    } catch {
      return null;
    }
    const parsed = RawModelExplanationSchema.safeParse(candidate);
    if (!parsed.success) return null;
    const explanation = sanitizeExplanation(parsed.data.explanation, "", 600);
    if (!explanation) return null;
    if (ABSOLUTE_CLAIMS.test(explanation)) return null;
    if (input.status !== "matched" && SIGN_ENCOURAGEMENT.test(explanation)) return null;
    return explanation;
  });
  return { explanation: value, meta };
}

export { AiProviderError };
