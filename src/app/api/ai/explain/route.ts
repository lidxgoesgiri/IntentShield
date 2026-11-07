import { createAiHandlers } from "@/server/ai/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createAiHandlers();

/**
 * POST /api/ai/explain — optional plain-language explanation of a verdict the
 * deterministic verifier already produced. Receives no addresses or free text.
 */
export async function POST(request: Request): Promise<Response> {
  return handlers.explain(request);
}
