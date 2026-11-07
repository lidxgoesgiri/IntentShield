import "server-only";
import { ExplainRequestSchema, ParseIntentRequestSchema } from "@/features/intent/schema";
import { errorResponse, isForeignOrigin, jsonResponse, readJsonBody } from "../http";
import { clientKey, createDailyBudget, createRateLimiter } from "../security/request-limit";
import { logSafeEvent } from "../security/safe-logging";
import { AiProviderError, type FetchLike } from "./client";
import { getAiConfig, type AiConfig } from "./config";
import { AiInvalidOutputError, explainVerificationWithAi, parseIntentWithAi } from "./parse-intent";

export type AiHandlerDeps = Readonly<{
  getConfig?: () => AiConfig;
  fetchImpl?: FetchLike;
  now?: () => number;
}>;

const UNAVAILABLE_MESSAGE = "AI assistance is unavailable. You can still transfer manually.";

function unavailable(code: string): Response {
  logSafeEvent("ai.unavailable", { code });
  return errorResponse(503, "AI_UNAVAILABLE", UNAVAILABLE_MESSAGE);
}

/**
 * Factory for the AI route handlers. Limits are created once per factory call
 * (i.e. once per server instance in production).
 */
export function createAiHandlers(deps: AiHandlerDeps = {}) {
  const getConfig = deps.getConfig ?? (() => getAiConfig());
  const initial = getConfig();
  const limiter = createRateLimiter({
    limit: initial.requestsPerMinute,
    windowMs: 60_000,
    ...(deps.now ? { now: deps.now } : {}),
  });
  const budget = createDailyBudget({ budget: initial.dailyBudget, ...(deps.now ? { now: deps.now } : {}) });

  async function guard(request: Request): Promise<{ ok: true; body: unknown; config: AiConfig } | { ok: false; response: Response }> {
    if (isForeignOrigin(request)) {
      return { ok: false, response: errorResponse(403, "FORBIDDEN", "Cross-origin requests are not allowed.") };
    }
    const body = await readJsonBody(request);
    if (!body.ok) return { ok: false, response: body.response };

    const decision = limiter.check(clientKey(request));
    if (!decision.allowed) {
      return {
        ok: false,
        response: errorResponse(429, "RATE_LIMITED", "Too many AI requests. Wait a moment or enter the details manually.", {
          "Retry-After": String(decision.retryAfterSeconds),
        }),
      };
    }
    const config = getConfig();
    if (!config.configured) return { ok: false, response: unavailable("AI_NOT_CONFIGURED") };
    return { ok: true, body: body.value, config };
  }

  return {
    async parseIntent(request: Request): Promise<Response> {
      try {
        const guarded = await guard(request);
        if (!guarded.ok) return guarded.response;
        const parsed = ParseIntentRequestSchema.safeParse(guarded.body);
        if (!parsed.success) {
          return errorResponse(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request.");
        }
        if (!budget.consume()) return unavailable("BUDGET_EXHAUSTED");
        const result = await parseIntentWithAi(parsed.data.text, guarded.config, {
          signal: request.signal,
          ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        });
        logSafeEvent("ai.parse.ok", { route: "parse-intent", status: result.status });
        return jsonResponse(result);
      } catch (error) {
        if (error instanceof AiProviderError) return unavailable(`PROVIDER_${error.kind.toUpperCase()}`);
        if (error instanceof AiInvalidOutputError) return unavailable("AI_INVALID_OUTPUT");
        logSafeEvent("ai.parse.error", { code: "INTERNAL_ERROR" });
        return errorResponse(500, "INTERNAL_ERROR", "Something went wrong. Enter the transfer details manually.");
      }
    },

    async explain(request: Request): Promise<Response> {
      try {
        const guarded = await guard(request);
        if (!guarded.ok) return guarded.response;
        const parsed = ExplainRequestSchema.safeParse(guarded.body);
        if (!parsed.success) return errorResponse(400, "VALIDATION_ERROR", "Invalid verification summary.");
        if (!budget.consume()) return unavailable("BUDGET_EXHAUSTED");
        const explanation = await explainVerificationWithAi(parsed.data, guarded.config, {
          signal: request.signal,
          ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        });
        logSafeEvent("ai.explain.ok", { route: "explain", status: parsed.data.status });
        return jsonResponse({ explanation });
      } catch (error) {
        if (error instanceof AiProviderError) return unavailable(`PROVIDER_${error.kind.toUpperCase()}`);
        if (error instanceof AiInvalidOutputError) return unavailable("AI_INVALID_OUTPUT");
        logSafeEvent("ai.explain.error", { code: "INTERNAL_ERROR" });
        return errorResponse(500, "INTERNAL_ERROR", "Something went wrong while generating the explanation.");
      }
    },
  };
}
