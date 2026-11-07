import "server-only";
import type { AiConfig } from "./config";

export type ChatMessage = Readonly<{ role: "system" | "user"; content: string }>;

export class AiProviderError extends Error {
  readonly kind: "not_configured" | "timeout" | "unavailable" | "bad_response";
  /** HTTP status from the provider, when there was a response. */
  readonly status: number | null;
  constructor(kind: AiProviderError["kind"], message: string, status: number | null = null) {
    super(message);
    this.name = "AiProviderError";
    this.kind = kind;
    this.status = status;
  }
}

/** Per-call provider timeout (PRD §9.3). */
export const AI_TIMEOUT_MS = 8_000;

export type CompletionRequest = Readonly<{
  /** Model id from the server-side allowlist. */
  model: string;
  messages: readonly ChatMessage[];
  /** JSON schema for structured output (OpenAI-compatible `response_format`). */
  jsonSchema?: Readonly<{ name: string; schema: Record<string, unknown> }>;
  /** Includes headroom for reasoning models, which spend tokens before answering. */
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}>;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function isOpenRouter(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.endsWith("openrouter.ai");
  } catch {
    return false;
  }
}

/**
 * Minimal server-only OpenAI-compatible chat completion call (OpenRouter by
 * default). One call, no retries here, and no logging of prompts, outputs, or
 * keys. Empty output (e.g. a reasoning model that ran out of tokens) is an
 * error so the caller can fall back.
 */
export async function createChatCompletion(
  config: AiConfig,
  request: CompletionRequest,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  if (!config.configured || !config.apiKey || !config.models.includes(request.model)) {
    throw new AiProviderError("not_configured", "AI provider or model is not configured.");
  }

  const timeout = AbortSignal.timeout(Math.max(1, Math.min(request.timeoutMs ?? AI_TIMEOUT_MS, AI_TIMEOUT_MS)));
  const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;

  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages,
    temperature: 0,
    max_tokens: request.maxTokens ?? 900,
  };
  if (request.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: request.jsonSchema.name, strict: true, schema: request.jsonSchema.schema },
    };
  }
  if (isOpenRouter(config.baseUrl)) {
    // Keep reasoning short and out of the response so the answer fits the budget.
    body.reasoning = { effort: "low", exclude: true };
  }

  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "IntentShield",
        ...(config.appUrl ? { "HTTP-Referer": config.appUrl } : {}),
      },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (timeout.aborted || (error instanceof DOMException && error.name === "TimeoutError")) {
      throw new AiProviderError("timeout", "AI provider timed out.");
    }
    throw new AiProviderError("unavailable", "AI provider could not be reached.");
  }

  if (!response.ok) {
    throw new AiProviderError("unavailable", `AI provider responded with HTTP ${response.status}.`, response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AiProviderError("bad_response", "AI provider returned a non-JSON body.", response.status);
  }

  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new AiProviderError("bad_response", "AI provider returned no content.", response.status);
  }
  return content;
}

/** Extract the first JSON object from model text (tolerates code fences). */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new SyntaxError("No JSON object found in model output.");
  }
}
