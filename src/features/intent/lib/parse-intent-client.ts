import { MAX_INTENT_TEXT_LENGTH } from "@/config/product";
import { ParseIntentResponseSchema, ApiErrorSchema } from "../schema";
import type { ParseIntentResponse } from "../types";
import { enforceIntentGuards } from "./normalize-intent";

export type AiFailureKind = "unavailable" | "rate_limited" | "invalid_request" | "invalid_response" | "offline";

export type ParseClientResult =
  | { ok: true; response: ParseIntentResponse }
  | { ok: false; kind: AiFailureKind; message: string };

export const AI_OFFLINE_MESSAGE = "AI help is offline. Enter the transfer details manually.";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Call the server AI parser. The response is UNTRUSTED: it is schema-validated
 * here and the same deterministic guards as the server are re-applied before
 * anything reaches the draft. Any failure maps to a manual-entry fallback.
 */
export async function requestIntentParse(
  text: string,
  options: { signal?: AbortSignal; fetchImpl?: FetchLike; timeoutMs?: number; online?: boolean; model?: string | null } = {},
): Promise<ParseClientResult> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, kind: "invalid_request", message: "Describe the transfer you want to make." };
  if (trimmed.length > MAX_INTENT_TEXT_LENGTH) {
    return { ok: false, kind: "invalid_request", message: `Keep the request under ${MAX_INTENT_TEXT_LENGTH} characters.` };
  }
  const online = options.online ?? (typeof navigator === "undefined" ? true : navigator.onLine);
  if (!online) return { ok: false, kind: "offline", message: AI_OFFLINE_MESSAGE };

  const fetchImpl = options.fetchImpl ?? fetch;
  // Covers the server's primary attempt + one model fallback (≈18 s budget).
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 22_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetchImpl("/api/ai/parse-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options.model ? { text: trimmed, model: options.model } : { text: trimmed }),
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { ok: false, kind: "unavailable", message: AI_OFFLINE_MESSAGE };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // UT-15: malformed JSON → manual fallback.
    return { ok: false, kind: "invalid_response", message: AI_OFFLINE_MESSAGE };
  }

  if (!response.ok) {
    const apiError = ApiErrorSchema.safeParse(payload);
    if (response.status === 429) {
      return { ok: false, kind: "rate_limited", message: "Too many AI requests right now. Enter the details manually or try again shortly." };
    }
    if (response.status === 400 && apiError.success) {
      return { ok: false, kind: "invalid_request", message: apiError.data.error.message };
    }
    return { ok: false, kind: "unavailable", message: AI_OFFLINE_MESSAGE };
  }

  const validated = ParseIntentResponseSchema.safeParse(payload);
  if (!validated.success) return { ok: false, kind: "invalid_response", message: AI_OFFLINE_MESSAGE };

  // Defense in depth: never trust the server's guard alone either.
  const guarded = enforceIntentGuards(
    {
      status: validated.data.status,
      draft: validated.data.draft,
      missingFields: validated.data.missingFields,
      explanation: validated.data.explanation,
    },
    trimmed,
  );
  // Model attribution is display-only and re-attached after the guards ran.
  return { ok: true, response: validated.data.meta ? { ...guarded, meta: validated.data.meta } : guarded };
}
