import "server-only";
import type { AiConfig } from "./config";

export type ChatMessage = Readonly<{ role: "system" | "user"; content: string }>;

export class AiProviderError extends Error {
  readonly kind: "not_configured" | "timeout" | "unavailable" | "bad_response";
  constructor(kind: AiProviderError["kind"], message: string) {
    super(message);
    this.name = "AiProviderError";
    this.kind = kind;
  }
}

export const AI_TIMEOUT_MS = 8_000;

export type CompletionRequest = Readonly<{
  messages: readonly ChatMessage[];
  /** JSON schema for structured output (OpenAI-compatible `response_format`). */
  jsonSchema?: Readonly<{ name: string; schema: Record<string, unknown> }>;
  maxTokens?: number;
  signal?: AbortSignal;
}>;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Minimal server-only OpenAI-compatible chat completion call (OpenRouter by
 * default). No retries here, no logging of prompts, outputs, or keys.
 */
export async function createChatCompletion(
  config: AiConfig,
  request: CompletionRequest,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  if (!config.configured || !config.apiKey || !config.model) {
    throw new AiProviderError("not_configured", "AI provider is not configured.");
  }

  const timeout = AbortSignal.timeout(AI_TIMEOUT_MS);
  const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;

  const body: Record<string, unknown> = {
    model: config.model,
    messages: request.messages,
    temperature: 0,
    max_tokens: request.maxTokens ?? 300,
  };
  if (request.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: request.jsonSchema.name, strict: true, schema: request.jsonSchema.schema },
    };
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
    throw new AiProviderError("unavailable", `AI provider responded with HTTP ${response.status}.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AiProviderError("bad_response", "AI provider returned a non-JSON body.");
  }

  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new AiProviderError("bad_response", "AI provider returned no content.");
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
