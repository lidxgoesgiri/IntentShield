import "server-only";
import { z } from "zod";

const aiEnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().trim().min(1).optional(),
  OPENROUTER_MODEL: z.string().trim().min(1).optional(),
  AI_BASE_URL: z.string().trim().url().default("https://openrouter.ai/api/v1"),
  AI_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(120).default(10),
  AI_DAILY_REQUEST_BUDGET: z.coerce.number().int().min(1).max(100_000).default(500),
  NEXT_PUBLIC_APP_URL: z.string().trim().url().optional(),
});

export type AiConfig = Readonly<{
  configured: boolean;
  apiKey: string | null;
  model: string | null;
  baseUrl: string;
  requestsPerMinute: number;
  dailyBudget: number;
  appUrl: string | null;
}>;

const blankToUndefined = (value: string | undefined) => (value && value.trim().length > 0 ? value : undefined);

/** Read server-only AI configuration at call time (never bundled to the client). */
export function getAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const parsed = aiEnvSchema.safeParse({
    OPENROUTER_API_KEY: blankToUndefined(env.OPENROUTER_API_KEY),
    OPENROUTER_MODEL: blankToUndefined(env.OPENROUTER_MODEL),
    AI_BASE_URL: blankToUndefined(env.AI_BASE_URL),
    AI_REQUESTS_PER_MINUTE: blankToUndefined(env.AI_REQUESTS_PER_MINUTE),
    AI_DAILY_REQUEST_BUDGET: blankToUndefined(env.AI_DAILY_REQUEST_BUDGET),
    NEXT_PUBLIC_APP_URL: blankToUndefined(env.NEXT_PUBLIC_APP_URL),
  });
  if (!parsed.success) {
    // Misconfiguration disables AI (fail closed) instead of crashing the route.
    return {
      configured: false,
      apiKey: null,
      model: null,
      baseUrl: "https://openrouter.ai/api/v1",
      requestsPerMinute: 10,
      dailyBudget: 500,
      appUrl: null,
    };
  }
  const data = parsed.data;
  return {
    configured: Boolean(data.OPENROUTER_API_KEY && data.OPENROUTER_MODEL),
    apiKey: data.OPENROUTER_API_KEY ?? null,
    model: data.OPENROUTER_MODEL ?? null,
    baseUrl: data.AI_BASE_URL.replace(/\/+$/, ""),
    requestsPerMinute: data.AI_REQUESTS_PER_MINUTE,
    dailyBudget: data.AI_DAILY_REQUEST_BUDGET,
    appUrl: data.NEXT_PUBLIC_APP_URL ?? null,
  };
}
