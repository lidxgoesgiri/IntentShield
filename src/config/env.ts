import { z } from "zod";

/**
 * Browser-safe configuration. Each NEXT_PUBLIC_ variable is referenced
 * literally so Next.js can inline it at build time. Secrets never live here.
 */
const rawPublicEnv = {
  NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
  NEXT_PUBLIC_SOLANA_CLUSTER: process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_REPOSITORY_URL: process.env.NEXT_PUBLIC_REPOSITORY_URL,
  NEXT_PUBLIC_DOCS_URL: process.env.NEXT_PUBLIC_DOCS_URL,
};

const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

const httpsUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    // Zod still runs this refinement after `.url()` reports an issue, so a
    // malformed value must become an issue here too, never an exception that
    // crashes module load instead of failing closed through `configError`.
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  }, {
    message: "Must be an https URL",
  });

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SOLANA_RPC_URL: z.preprocess(emptyToUndefined, httpsUrl.default("https://api.devnet.solana.com")),
  /** Devnet only. Mainnet/testnet values are rejected outright. */
  NEXT_PUBLIC_SOLANA_CLUSTER: z.preprocess(emptyToUndefined, z.literal("devnet").default("devnet")),
  NEXT_PUBLIC_APP_URL: z.preprocess(emptyToUndefined, z.string().url().default("http://localhost:3000")),
  NEXT_PUBLIC_REPOSITORY_URL: z.preprocess(emptyToUndefined, httpsUrl.optional()),
  NEXT_PUBLIC_DOCS_URL: z.preprocess(emptyToUndefined, httpsUrl.optional()),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export type PublicEnvResult = { ok: true; env: PublicEnv } | { ok: false; issues: string[] };

export function parsePublicEnv(raw: Record<string, string | undefined> = rawPublicEnv): PublicEnvResult {
  const parsed = publicEnvSchema.safeParse(raw);
  if (parsed.success) return { ok: true, env: parsed.data };
  return { ok: false, issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
}

export const publicEnvResult = parsePublicEnv();

/**
 * Safe accessor: on invalid configuration the cluster/RPC fall back to
 * Devnet defaults AND `configError` is set, which disables transfers (fail closed).
 */
export const publicConfig = {
  rpcUrl: publicEnvResult.ok ? publicEnvResult.env.NEXT_PUBLIC_SOLANA_RPC_URL : "https://api.devnet.solana.com",
  cluster: "devnet" as const,
  appUrl: publicEnvResult.ok ? publicEnvResult.env.NEXT_PUBLIC_APP_URL : "http://localhost:3000",
  repositoryUrl: publicEnvResult.ok ? publicEnvResult.env.NEXT_PUBLIC_REPOSITORY_URL : undefined,
  docsUrl: publicEnvResult.ok ? publicEnvResult.env.NEXT_PUBLIC_DOCS_URL : undefined,
  configError: publicEnvResult.ok ? null : publicEnvResult.issues.join("; "),
};
