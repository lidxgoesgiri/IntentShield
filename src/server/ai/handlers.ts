import "server-only";
import { ExplainRequestSchema, ParseIntentRequestSchema } from "@/features/intent/schema";
import { errorResponse, isForeignOrigin, jsonResponse, readJsonBody } from "../http";
import { clientKey, createDailyBudget, createRateLimiter, instanceAiProtection, type AiProtection } from "../security/request-limit";
import { logSafeEvent } from "../security/safe-logging";
import { AiProviderError, type FetchLike } from "./client";
import { getAiConfig, type AiConfig } from "./config";
import { listModelOptions, resolveModelChain, sharedModelHealth, type ModelHealth } from "./models";
import { AiInvalidOutputError, AiUnsupportedModelError, explainVerificationWithAi, parseIntentWithAi } from "./parse-intent";

export type AiHandlerDeps = Readonly<{
  getConfig?: () => AiConfig;
  fetchImpl?: FetchLike;
  now?: () => number;
  health?: ModelHealth;
  protection?: AiProtection;
}>;

const UNAVAILABLE_MESSAGE = "AI assistance is unavailable. You can still transfer manually.";
const UNSUPPORTED_MODEL_MESSAGE = "That AI model is not available on this deployment. Choose one from the list.";

function unavailable(code: string): Response {
  logSafeEvent("ai.unavailable", { code });
  return errorResponse(503, "AI_UNAVAILABLE", UNAVAILABLE_MESSAGE);
}

/**
 * Factory for AI route handlers. Production guards and model health are shared
 * within one process; no claim of a global multi-instance spending cap.
 */
export function createAiHandlers(deps: AiHandlerDeps = {}) {
  const getConfig = deps.getConfig ?? (() => getAiConfig());
  const health = deps.health ?? sharedModelHealth;
  const initial = getConfig();
  // Production route modules use a shared process guard. Dependency-injected
  // factories stay isolated unless a test explicitly supplies shared controls.
  const { limiter, budget } = deps.protection ?? (Object.keys(deps).length === 0
    ? instanceAiProtection(initial)
    : {
        limiter: createRateLimiter({ limit: initial.requestsPerMinute, windowMs: 60_000, ...(deps.now ? { now: deps.now } : {}) }),
        budget: createDailyBudget({ budget: initial.dailyBudget, ...(deps.now ? { now: deps.now } : {}) }),
      });

  async function guard(request: Request): Promise<{ ok: true; body: unknown; config: AiConfig } | { ok: false; response: Response }> {
    if (isForeignOrigin(request)) {
      return { ok: false, response: errorResponse(403, "FORBIDDEN", "Cross-origin requests are not allowed.") };
    }
    const decision = limiter.check(clientKey(request));
    if (!decision.allowed) {
      return {
        ok: false,
        response: errorResponse(429, "RATE_LIMITED", "Too many AI requests. Wait a moment or enter the details manually.", {
          "Retry-After": String(decision.retryAfterSeconds),
        }),
      };
    }
    const body = await readJsonBody(request);
    if (!body.ok) return { ok: false, response: body.response };
    const config = getConfig();
    if (!config.configured) return { ok: false, response: unavailable("AI_NOT_CONFIGURED") };
    return { ok: true, body: body.value, config };
  }

  /** Reject models outside the server allowlist before any provider call. */
  function checkModel(config: AiConfig, model: string | undefined): Response | null {
    const plan = resolveModelChain(config, model);
    if (plan.ok) return null;
    if (plan.reason === "UNSUPPORTED_MODEL") return errorResponse(400, "VALIDATION_ERROR", UNSUPPORTED_MODEL_MESSAGE);
    return unavailable("AI_NOT_CONFIGURED");
  }

  function mapError(error: unknown, route: string): Response {
    if (error instanceof AiUnsupportedModelError) return errorResponse(400, "VALIDATION_ERROR", UNSUPPORTED_MODEL_MESSAGE);
    if (error instanceof AiProviderError) return unavailable(`PROVIDER_${error.kind.toUpperCase()}`);
    if (error instanceof AiInvalidOutputError) return unavailable("AI_INVALID_OUTPUT");
    logSafeEvent(`ai.${route}.error`, { code: "INTERNAL_ERROR" });
    return errorResponse(500, "INTERNAL_ERROR", "Something went wrong. Enter the transfer details manually.");
  }

  return {
    /** GET /api/ai/models — public ids/labels of the server allowlist; never keys. */
    models(): Response {
      const config = getConfig();
      if (!config.configured) return jsonResponse({ available: false, defaultModel: null, models: [] });
      return jsonResponse({ available: true, defaultModel: config.defaultModel, models: listModelOptions(config) });
    },

    async parseIntent(request: Request): Promise<Response> {
      try {
        const guarded = await guard(request);
        if (!guarded.ok) return guarded.response;
        const parsed = ParseIntentRequestSchema.safeParse(guarded.body);
        if (!parsed.success) {
          return errorResponse(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request.");
        }
        const rejected = checkModel(guarded.config, parsed.data.model);
        if (rejected) return rejected;
        const { result, meta } = await parseIntentWithAi(parsed.data.text, guarded.config, {
          model: parsed.data.model ?? null,
          signal: request.signal,
          health,
          consumeBudget: () => budget.consume(),
          ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
          ...(deps.now ? { now: deps.now } : {}),
        });
        logSafeEvent("ai.parse.ok", { route: "parse-intent", status: result.status, model: meta.model, kind: meta.fallbackUsed ? "fallback" : "primary" });
        return jsonResponse({ ...result, meta });
      } catch (error) {
        return mapError(error, "parse");
      }
    },

    async explain(request: Request): Promise<Response> {
      try {
        const guarded = await guard(request);
        if (!guarded.ok) return guarded.response;
        const parsed = ExplainRequestSchema.safeParse(guarded.body);
        if (!parsed.success) return errorResponse(400, "VALIDATION_ERROR", "Invalid verification summary.");
        const { model, ...summary } = parsed.data;
        const rejected = checkModel(guarded.config, model);
        if (rejected) return rejected;
        const { explanation, meta } = await explainVerificationWithAi(summary, guarded.config, {
          model: model ?? null,
          signal: request.signal,
          health,
          consumeBudget: () => budget.consume(),
          ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
          ...(deps.now ? { now: deps.now } : {}),
        });
        logSafeEvent("ai.explain.ok", { route: "explain", status: summary.status, model: meta.model });
        return jsonResponse({ explanation, meta });
      } catch (error) {
        return mapError(error, "explain");
      }
    },
  };
}
