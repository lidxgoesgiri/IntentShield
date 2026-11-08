import { ExplainResponseSchema, type ExplainRequest } from "@/features/intent/schema";
import type { AiCallMeta } from "@/features/intent/types";
import { sanitizeExplanation } from "@/features/intent/lib/normalize-intent";
import { readBoundedJson } from "@/lib/http/read-bounded-json";

export type ExplainClientResult = { ok: true; explanation: string; meta: AiCallMeta | null } | { ok: false; message: string };

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Request an optional AI explanation for an existing deterministic verdict.
 * Display-only: the result can never change verification state.
 */
export async function requestVerificationExplanation(
  summary: ExplainRequest,
  options: { signal?: AbortSignal; fetchImpl?: FetchLike; model?: string | null } = {},
): Promise<ExplainClientResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = AbortSignal.timeout(22_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    signal.throwIfAborted();
    const response = await fetchImpl("/api/ai/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options.model ? { ...summary, model: options.model } : summary),
      signal,
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      return { ok: false, message: "AI explanation is unavailable. The checks above are complete without it." };
    }
    const parsed = ExplainResponseSchema.safeParse(await readBoundedJson(response, { maxBytes: 16_384, signal }));
    if (!parsed.success) return { ok: false, message: "AI explanation is unavailable. The checks above are complete without it." };
    const explanation = sanitizeExplanation(parsed.data.explanation, "", 600);
    if (!explanation) return { ok: false, message: "AI explanation is unavailable. The checks above are complete without it." };
    return { ok: true, explanation, meta: parsed.data.meta ?? null };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { ok: false, message: "AI explanation is unavailable. The checks above are complete without it." };
  }
}
