import { createAiHandlers } from "@/server/ai/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createAiHandlers();

/**
 * POST /api/ai/parse-intent — natural language → untrusted structured draft.
 * Never builds, signs, or sends transactions (PRD §16.1).
 */
export async function POST(request: Request): Promise<Response> {
  return handlers.parseIntent(request);
}
