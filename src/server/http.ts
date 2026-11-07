import "server-only";

export type ApiErrorCode = "VALIDATION_ERROR" | "RATE_LIMITED" | "AI_UNAVAILABLE" | "INTERNAL_ERROR" | "FORBIDDEN";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return Response.json(body, { status: init.status ?? 200, headers: { ...NO_STORE, ...init.headers } });
}

/** Sanitized error envelope — never includes stack traces, keys, or provider payloads. */
export function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return jsonResponse({ error: { code, message } }, { status, headers });
}

const MAX_BODY_BYTES = 4_096;

export type JsonBodyResult = { ok: true; value: unknown } | { ok: false; response: Response };

/** Read a small JSON body defensively (size cap, content-type, parse errors). */
export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, response: errorResponse(400, "VALIDATION_ERROR", "Send a JSON body (Content-Type: application/json).") };
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return { ok: false, response: errorResponse(400, "VALIDATION_ERROR", "Request body is too large.") };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { ok: false, response: errorResponse(400, "VALIDATION_ERROR", "Request body is too large.") };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: errorResponse(400, "VALIDATION_ERROR", "Request body is not valid JSON.") };
  }
}

/**
 * Browsers always send Origin on cross-site POSTs. Reject foreign origins so a
 * third-party page cannot spend this deployment's AI budget.
 */
export function isForeignOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
