import { AiModelsResponseSchema, type AiModelsResponse } from "../schema";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type AiModelsResult = { ok: true; data: AiModelsResponse } | { ok: false };

/** Load the server-side model allowlist (public ids and labels only). */
export async function fetchAiModels(options: { signal?: AbortSignal; fetchImpl?: FetchLike } = {}): Promise<AiModelsResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = AbortSignal.timeout(8_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const response = await fetchImpl("/api/ai/models", { method: "GET", signal, cache: "no-store" });
    if (!response.ok) return { ok: false };
    const parsed = AiModelsResponseSchema.safeParse(await response.json());
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { ok: false };
  }
}

const STORAGE_KEY = "intentshield:ai-model";

/** Persisted choice is only a preference: it is honoured only if still allowlisted. */
export function readStoredModel(models: AiModelsResponse["models"]): string | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && models.some((model) => model.id === stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeModel(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage unavailable: selection lasts for this page only */
  }
}
