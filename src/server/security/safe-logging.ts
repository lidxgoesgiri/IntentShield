import "server-only";

type SafeField = string | number | boolean | null;

const ALLOWED_FIELDS = new Set(["route", "code", "status", "attempt", "durationMs", "kind", "model"]);

/**
 * Log policy (PRD §17): never log natural-language input, wallet addresses,
 * instructions, keys, or provider payloads. Only allowlisted reason codes, and
 * only outside production unless INTENTSHIELD_DEBUG_LOGS=1.
 */
export function logSafeEvent(event: string, fields: Record<string, SafeField> = {}): void {
  const enabled = process.env.NODE_ENV !== "production" || process.env.INTENTSHIELD_DEBUG_LOGS === "1";
  if (!enabled || process.env.NODE_ENV === "test") return;
  const safe: Record<string, SafeField> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (ALLOWED_FIELDS.has(key)) safe[key] = typeof value === "string" ? value.slice(0, 64) : value;
  }
  console.info(`[intentshield] ${event}`, safe);
}
