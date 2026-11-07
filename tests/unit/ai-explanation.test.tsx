// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExplainRequest } from "@/features/intent/schema";
import { AiExplanation } from "@/features/verification/components/ai-explanation";

const SUMMARY: ExplainRequest = {
  status: "matched", reasons: [], intendedAmountSol: "0.1", actualAmountSol: "0.1",
  recipientMatches: true, simulation: "not_run", simulationErrorCode: null,
};
const props = {
  summary: SUMMARY, verdictKey: "review", disabledReason: null, model: "a/one",
  labelFor: (id: string | null | undefined) => id ?? "server default",
};

afterEach(() => vi.unstubAllGlobals());

function deferredProvider() {
  let finish!: (response: Response) => void;
  let signal: AbortSignal | null = null;
  vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
    signal = init.signal ?? null;
    return new Promise<Response>((resolve) => { finish = resolve; });
  }));
  return {
    get signal() { return signal; },
    async resolve(text: string) {
      await act(async () => { finish(Response.json({ explanation: text })); });
    },
  };
}

describe("AI explanations stay bound to their verdict", () => {
  it("always shows the deterministic result before optional model prose", () => {
    render(<AiExplanation {...props} summary={{ ...SUMMARY, status: "blocked", reasons: ["AMOUNT_MISMATCH"] }} />);
    expect(screen.getByText(/Verification failed\. Signing is disabled/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explain in plain language" })).toBeEnabled();
  });

  it("aborts and discards an old explanation when simulation changes", async () => {
    const provider = deferredProvider();
    const view = render(<AiExplanation {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Explain in plain language" }));
    view.rerender(<AiExplanation {...props} verdictKey="simulation-failed" summary={{ ...SUMMARY, simulation: "failed" }} />);
    expect(provider.signal?.aborted).toBe(true);
    await provider.resolve("Old explanation: simulation has not run.");
    expect(screen.queryByText(/Old explanation/)).toBeNull();
    expect(screen.getByText(/simulation failed\. Signing is disabled/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explain in plain language" })).toBeEnabled();
  });

  it("invalidates an in-flight answer when the selected model changes", async () => {
    const provider = deferredProvider();
    const view = render(<AiExplanation {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Explain in plain language" }));
    view.rerender(<AiExplanation {...props} model="b/two" />);
    expect(provider.signal?.aborted).toBe(true);
    await provider.resolve("Answer from the previous model.");
    expect(screen.queryByText("Answer from the previous model.")).toBeNull();
    expect(screen.getByRole("button", { name: "Explain in plain language" })).toBeEnabled();
  });

  it("labels model prose as untrusted while retaining the rule-based verdict", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ explanation: "The amount matches the approved values." })));
    render(<AiExplanation {...props} summary={{ ...SUMMARY, simulation: "passed" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Explain in plain language" }));
    expect(await screen.findByText("The amount matches the approved values.")).toBeInTheDocument();
    expect(screen.getByText(/rule-based result above is authoritative/)).toBeInTheDocument();
    expect(screen.getByText(/does not establish recipient trustworthiness/)).toBeInTheDocument();
  });
});
