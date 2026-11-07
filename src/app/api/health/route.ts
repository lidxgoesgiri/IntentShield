export const dynamic = "force-dynamic";

/** GET /api/health — liveness only; exposes no secrets or internal state (PRD §16.2). */
export function GET(): Response {
  return Response.json(
    { status: "ok", service: "intentshield", cluster: "devnet" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
