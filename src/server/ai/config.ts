import "server-only";
import { z } from "zod";

/** `provider/model[:variant]`, e.g. "nvidia/nemotron-3.5-lightning:free". */
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}\/[a-z0-9][a-z0-9._:-]{0,95}$/i;
export const MAX_ALLOWLISTED_MODELS = 12;

/**
 * Parse a comma-separated model list, keeping only well-formed, unique ids in
 * their configured order. Malformed entries are dropped, never forwarded.
 */
export function parseModelList(value: string | undefined | null): string[] {
  if (!value) return [];
  const models: string[] = [];
  for (const entry of value.split(",")) {
    const id = entry.trim();
    if (id.length > 0 && MODEL_ID_PATTERN.test(id) && !models.includes(id)) models.push(id);
  }
  return models;
}

const aiEnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().trim().min(1).optional(),
  OPENROUTER_MODEL: z.string().trim().optional(),
  OPENROUTER_MODELS: z.string().trim().optional(),
  AI_BASE_URL: z.string().trim().url().default("https://openrouter.ai/api/v1"),
  AI_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(120).default(10),
  AI_DAILY_REQUEST_BUDGET: z.coerce.number().int().min(1).max(100_000).default(500),
  NEXT_PUBLIC_APP_URL: z.string().trim().url().optional(),
});

export type AiConfig = Readonly<{
  configured: boolean;
  apiKey: string | null;
  /** Server-side allowlist of selectable models; the default model is first. */
  models: readonly string[];
  defaultModel: string | null;
  baseUrl: string;
  requestsPerMinute: number;
  dailyBudget: number;
  appUrl: string | null;
}>;

const blankToUndefined = (value: string | undefined) => (value && value.trim().length > 0 ? value : undefined);

const DISABLED: AiConfig = {
  configured: false,
  apiKey: null,
  models: [],
  defaultModel: null,
  baseUrl: "https://openrouter.ai/api/v1",
  requestsPerMinute: 10,
  dailyBudget: 500,
  appUrl: null,
};

/**
 * Read server-only AI configuration at call time (never bundled to the client).
 *
 * Models: `OPENROUTER_MODEL` is the default and may itself be a comma-separated
 * list (its first entry is the default); `OPENROUTER_MODELS` adds more
 * selectable models. Together they form the allowlist the browser may choose
 * from — any other model id is rejected by the API.
 */
export function getAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const parsed = aiEnvSchema.safeParse({
    OPENROUTER_API_KEY: blankToUndefined(env.OPENROUTER_API_KEY),
    OPENROUTER_MODEL: blankToUndefined(env.OPENROUTER_MODEL),
    OPENROUTER_MODELS: blankToUndefined(env.OPENROUTER_MODELS),
    AI_BASE_URL: blankToUndefined(env.AI_BASE_URL),
    AI_REQUESTS_PER_MINUTE: blankToUndefined(env.AI_REQUESTS_PER_MINUTE),
    AI_DAILY_REQUEST_BUDGET: blankToUndefined(env.AI_DAILY_REQUEST_BUDGET),
    NEXT_PUBLIC_APP_URL: blankToUndefined(env.NEXT_PUBLIC_APP_URL),
  });
  // Misconfiguration disables AI (fail closed) instead of crashing the route.
  if (!parsed.success) return DISABLED;

  const data = parsed.data;
  const models = [...new Set([...parseModelList(data.OPENROUTER_MODEL), ...parseModelList(data.OPENROUTER_MODELS)])].slice(
    0,
    MAX_ALLOWLISTED_MODELS,
  );
  const defaultModel = models[0] ?? null;
  return {
    configured: Boolean(data.OPENROUTER_API_KEY && defaultModel),
    apiKey: data.OPENROUTER_API_KEY ?? null,
    models,
    defaultModel,
    baseUrl: data.AI_BASE_URL.replace(/\/+$/, ""),
    requestsPerMinute: data.AI_REQUESTS_PER_MINUTE,
    dailyBudget: data.AI_DAILY_REQUEST_BUDGET,
    appUrl: data.NEXT_PUBLIC_APP_URL ?? null,
  };
}
