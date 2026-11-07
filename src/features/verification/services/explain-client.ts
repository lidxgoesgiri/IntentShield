import { ExplainResponseSchema, type ExplainRequest } from "@/features/intent/schema";
import { sanitizeExplanation } from "@/features/intent/lib/normalize-intent";

export type ExplainClientResult = { ok: true; explanation: string } | { ok: false; message: string };

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Request an optional AI explanation for an existing deterministic verdict.
 * Display-only: the result can never change verification state.
 */
export async function requestVerificationExplanation(
  summary: ExplainRequest,
  options: { signal?: AbortSignal; fetchImpl?: FetchLike } = {},
): Promise<ExplainClientResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = AbortSignal.timeout(12_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const response = await fetchImpl("/api/ai/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(summary),
      signal,
    });
    if (!response.ok) return { ok: false, message: "AI explanation is unavailable. The checks above are complete without it." };
    const parsed = ExplainResponseSchema.safeParse(await response.json());
    if (!parsed.success) return { ok: false, message: "AI explanation is unavailable. The checks above are complete without it." };
    return { ok: true, explanation: sanitizeExplanation(parsed.data.explanation, "", 600) };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { ok: false, message: "AI explanation is unavailable. The checks above are complete without it." };
  }
}
