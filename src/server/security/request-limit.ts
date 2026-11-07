import "server-only";
import { createHash } from "node:crypto";

export type RateDecision = Readonly<{ allowed: boolean; retryAfterSeconds: number }>;

/**
 * In-memory sliding-window limiter. Best effort: state is per server instance
 * (serverless instances do not share it). Documented in docs/ARCHITECTURE.md.
 */
export function createRateLimiter(options: { limit: number; windowMs: number; now?: () => number; maxKeys?: number }) {
  const hits = new Map<string, number[]>();
  const now = options.now ?? Date.now;
  const maxKeys = options.maxKeys ?? 5_000;

  return {
    check(key: string): RateDecision {
      const current = now();
      const windowStart = current - options.windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
      if (recent.length >= options.limit) {
        const oldest = recent[0] ?? current;
        hits.set(key, recent);
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + options.windowMs - current) / 1000)) };
      }
      recent.push(current);
      hits.set(key, recent);
      if (hits.size > maxKeys) {
        for (const [k, times] of hits) {
          if (times.every((t) => t <= windowStart)) hits.delete(k);
          if (hits.size <= maxKeys) break;
        }
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
    reset() {
      hits.clear();
    },
  };
}

/** Per-instance daily request budget guard (protects the AI bill). */
export function createDailyBudget(options: { budget: number; now?: () => number }) {
  const now = options.now ?? Date.now;
  let day = Math.floor(now() / 86_400_000);
  let used = 0;
  return {
    consume(): boolean {
      const today = Math.floor(now() / 86_400_000);
      if (today !== day) {
        day = today;
        used = 0;
      }
      if (used >= options.budget) return false;
      used += 1;
      return true;
    },
    reset() {
      used = 0;
    },
  };
}

/** Hash the client IP so raw addresses are never retained in memory. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim() || "anonymous";
  return createHash("sha256").update(`intentshield:${ip}`).digest("hex").slice(0, 32);
}
