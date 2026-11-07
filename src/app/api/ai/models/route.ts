import { createAiHandlers } from "@/server/ai/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createAiHandlers();

/**
 * GET /api/ai/models — the server-side model allowlist (ids, labels, default).
 * Contains no keys or provider configuration beyond public model ids.
 */
export function GET(): Response {
  return handlers.models();
}
