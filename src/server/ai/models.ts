import "server-only";
import type { AiConfig } from "./config";

/** Public, non-secret description of a selectable model. */
export type ModelOption = Readonly<{ id: string; label: string; isDefault: boolean }>;

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  "dots-studio": "Dots Studio",
  google: "Google",
  liquid: "Liquid AI",
  "meta-llama": "Meta",
  mistralai: "Mistral",
  nvidia: "NVIDIA",
  openai: "OpenAI",
  qwen: "Qwen",
  "x-ai": "xAI",
  "xingchen-agi": "XingChen",
};

const KNOWN_ACRONYMS = new Set(["lfm", "gpt", "llm", "vlm", "moe", "agi"]);

function titleToken(token: string): string {
  // Sizes and versions (26b, 3.5, a4b, 2.6b) read best in upper case.
  if (/^[\d.]+[a-z]?$/i.test(token) || /^[a-z]\d+[a-z]$/i.test(token)) return token.toUpperCase();
  // Two-letter tokens (vl, it) and known acronyms; ordinary words stay words.
  if (/^[a-z]{1,2}$/i.test(token) || KNOWN_ACRONYMS.has(token.toLowerCase())) return token.toUpperCase();
  return token.charAt(0).toUpperCase() + token.slice(1);
}

/** Human-readable label derived from a model id (display only). */
export function describeModel(id: string): string {
  const slash = id.indexOf("/");
  const provider = slash > 0 ? id.slice(0, slash) : "";
  const rest = slash > 0 ? id.slice(slash + 1) : id;
  const [name = rest, variant] = rest.split(":");
  const words = name.split(/[-_]/).filter(Boolean).map(titleToken).join(" ");
  const providerName = PROVIDER_NAMES[provider] ?? provider.split("-").filter(Boolean).map(titleToken).join(" ");
  return `${words}${providerName ? ` · ${providerName}` : ""}${variant ? ` (${variant})` : ""}`;
}

export function listModelOptions(config: AiConfig): ModelOption[] {
  return config.models.map((id) => ({ id, label: describeModel(id), isDefault: id === config.defaultModel }));
}

/**
 * Per-instance model health: after a provider failure (rate limit, timeout,
 * error, empty output) a model cools down briefly so the next request goes
 * to a healthier fallback first.
 */
export function createModelHealth(options: { cooldownMs?: number; now?: () => number } = {}) {
  const cooldownMs = options.cooldownMs ?? 60_000;
  const now = options.now ?? Date.now;
  const coolingUntil = new Map<string, number>();
  return {
    markFailure(model: string) {
      coolingUntil.set(model, now() + cooldownMs);
    },
    markSuccess(model: string) {
      coolingUntil.delete(model);
    },
    isCooling(model: string): boolean {
      const until = coolingUntil.get(model);
      return until !== undefined && until > now();
    },
  };
}

export type ModelHealth = ReturnType<typeof createModelHealth>;

/** Shared across AI routes in this server instance. */
export const sharedModelHealth: ModelHealth = createModelHealth();

/** Primary attempt + at most one fallback (PRD §9.3: at most one retry, then manual). */
export const MAX_MODEL_ATTEMPTS = 2;

export type ModelChainResult =
  | { ok: true; requestedModel: string; chain: readonly string[] }
  | { ok: false; reason: "NOT_CONFIGURED" | "UNSUPPORTED_MODEL" };

/**
 * Validate the requested model against the server-side allowlist and plan the
 * attempts: the requested model first (unless it is cooling down), then the
 * healthiest alternative, default model preferred. With a single configured
 * model the same model is retried once.
 */
export function resolveModelChain(
  config: AiConfig,
  requested: string | null | undefined,
  health?: ModelHealth,
): ModelChainResult {
  if (!config.configured || !config.defaultModel) return { ok: false, reason: "NOT_CONFIGURED" };
  const requestedModel = requested ?? config.defaultModel;
  if (!config.models.includes(requestedModel)) return { ok: false, reason: "UNSUPPORTED_MODEL" };

  const alternatives = [...new Set([config.defaultModel, ...config.models])].filter((model) => model !== requestedModel);
  if (alternatives.length === 0) return { ok: true, requestedModel, chain: [requestedModel, requestedModel] };

  const healthy = alternatives.filter((model) => !health?.isCooling(model));
  const pool = healthy.length > 0 ? healthy : alternatives;
  const requestedCooling = health?.isCooling(requestedModel) === true && healthy.length > 0;

  const chain = requestedCooling ? [pool[0]!, pool[1] ?? requestedModel] : [requestedModel, pool[0]!];
  return { ok: true, requestedModel, chain: chain.slice(0, MAX_MODEL_ATTEMPTS) };
}
