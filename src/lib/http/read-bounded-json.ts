/** Bound decoded response bytes before JSON parsing, including chunked bodies.
 * Callers supply their existing request deadline; cancellation also stops a
 * body that stalled after returning its HTTP headers.
 */
export async function readBoundedJson(response: Response, options: { maxBytes: number; signal: AbortSignal }): Promise<unknown> {
  options.signal.throwIfAborted();
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const declared = Number(declaredLength);
    if (!Number.isSafeInteger(declared) || declared < 0 || declared > options.maxBytes) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error("Response body exceeds its byte limit.");
    }
  }
  if (!response.body) throw new Error("Response has no JSON body.");
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  options.signal.addEventListener("abort", cancel, { once: true });
  try {
    let bytes = 0;
    let text = "";
    const decoder = new TextDecoder("utf-8", { fatal: true });
    while (true) {
      options.signal.throwIfAborted();
      const chunk = await reader.read();
      options.signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > options.maxBytes) throw new Error("Response body exceeds its byte limit.");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch (error) {
    cancel();
    throw error;
  } finally {
    options.signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
