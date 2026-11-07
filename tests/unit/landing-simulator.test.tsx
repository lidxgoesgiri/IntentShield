// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { InteractiveSimulator } from "@/features/landing/components/interactive-simulator";
import { createDemoState, demoReducer } from "@/features/landing/simulator/demo-machine";
import type { VerifierModule } from "@/features/landing/simulator/run-demo-check";

const realLoader = () => import("@/features/landing/simulator/verifier-entry");

function deferredLoader() {
  let resolve!: (value: VerifierModule) => void;
  const promise = new Promise<VerifierModule>((r) => {
    resolve = r;
  });
  return { loader: () => promise, resolve: () => realLoader().then(resolve) };
}

function status(container: HTMLElement) {
  return container.querySelector("[data-demo-status]")?.getAttribute("data-demo-status");
}

describe("InteractiveSimulator (PRD §28, LP-05…LP-10, LP-18)", () => {
  it("LP-05: idle → loading → success for the exact-match fixture via the shared verifier", async () => {
    const user = userEvent.setup();
    const { loader, resolve } = deferredLoader();
    const { container } = render(<InteractiveSimulator checkOptions={{ loadVerifier: loader }} />);
    expect(status(container)).toBe("idle");
    expect(screen.getByText("Controlled demo · No funds moved")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /run check/i }));
    expect(status(container)).toBe("loading");
    expect(screen.getByText("Checking sample transaction fields…")).toBeInTheDocument();

    await act(async () => {
      await resolve();
    });
    await waitFor(() => expect(status(container)).toBe("success"));
    expect(screen.getByText("Demo: supported transaction fields match the sample intent.")).toBeInTheDocument();
    // DEMO provenance persists in every state.
    expect(screen.getByText("Controlled demo · No funds moved")).toBeInTheDocument();
  });

  it("LP-06: changed amount → warning with the amount diff, no signing exposed", async () => {
    const user = userEvent.setup();
    const { container } = render(<InteractiveSimulator checkOptions={{ loadVerifier: realLoader }} />);
    await user.click(screen.getByRole("radio", { name: /changed amount/i }));
    await user.click(screen.getByRole("button", { name: /run check/i }));
    await waitFor(() => expect(status(container)).toBe("warning"));
    // Visible status + the sr-only live announcement both carry the copy.
    expect(screen.getAllByText(/Signing would be blocked/).length).toBe(2);
    expect(screen.getAllByText(/0\.8 SOL/).length).toBeGreaterThan(0);
    expect(screen.getByText("AMOUNT_MISMATCH")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign/i })).toBeNull();
  });

  it("LP-07: changed recipient → warning with a verifiable character diff", async () => {
    const user = userEvent.setup();
    const { container } = render(<InteractiveSimulator checkOptions={{ loadVerifier: realLoader }} />);
    await user.click(screen.getByRole("radio", { name: /changed recipient/i }));
    await user.click(screen.getByRole("button", { name: /run check/i }));
    await waitFor(() => expect(status(container)).toBe("warning"));
    expect(screen.getByText("RECIPIENT_MISMATCH")).toBeInTheDocument();
    expect(container.querySelectorAll("mark").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/characters differ/).length).toBeGreaterThan(0);
  });

  it("LP-08: a throwing verifier → failed with no invented conclusion; retry works", async () => {
    const user = userEvent.setup();
    let calls = 0;
    const flaky = async (): Promise<VerifierModule> => {
      calls += 1;
      const real = await realLoader();
      if (calls === 1) {
        return {
          ...real,
          verifyNativeSolTransfer: () => {
            throw new Error("boom");
          },
        };
      }
      return real;
    };
    const { container } = render(<InteractiveSimulator checkOptions={{ loadVerifier: flaky }} />);
    await user.click(screen.getByRole("button", { name: /run check/i }));
    await waitFor(() => expect(status(container)).toBe("failed"));
    expect(screen.getByText("Demo check could not complete. No security conclusion was produced.")).toBeInTheDocument();
    expect(screen.queryByText(/match the sample intent/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(status(container)).toBe("success"));
  });

  it("LP-09: verifier module unavailable → unavailable, no fake result, real-app CTA present", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <InteractiveSimulator checkOptions={{ loadVerifier: () => Promise.reject(new Error("chunk failed")) }} />,
    );
    await user.click(screen.getByRole("button", { name: /run check/i }));
    await waitFor(() => expect(status(container)).toBe("unavailable"));
    expect(screen.getByText("Demo verification is currently unavailable. Try again later.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /try a real devnet transfer/i })).toHaveAttribute("href", "/app");
  });

  it("optional RPC-unreachable scenario shows the fail-closed fallback", async () => {
    const user = userEvent.setup();
    const { container } = render(<InteractiveSimulator checkOptions={{ loadVerifier: realLoader }} />);
    await user.click(screen.getByRole("radio", { name: /rpc unreachable/i }));
    await user.click(screen.getByRole("button", { name: /run check/i }));
    await waitFor(() => expect(status(container)).toBe("unavailable"));
    expect(screen.getByText(/Unable to Verify/)).toBeInTheDocument();
  });

  it("LP-10: cancel/reset during loading drops the stale result", async () => {
    const user = userEvent.setup();
    const { loader, resolve } = deferredLoader();
    const { container } = render(<InteractiveSimulator checkOptions={{ loadVerifier: loader }} />);
    await user.click(screen.getByRole("button", { name: /run check/i }));
    expect(status(container)).toBe("loading");
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(status(container)).toBe("idle");
    await act(async () => {
      await resolve();
    });
    expect(status(container)).toBe("idle");
  });

  it("LP-18: results are announced through an aria-live region with descriptive text", async () => {
    const user = userEvent.setup();
    const { container } = render(<InteractiveSimulator checkOptions={{ loadVerifier: realLoader }} />);
    const live = container.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: /changed amount/i }));
    await user.click(screen.getByRole("button", { name: /run check/i }));
    await waitFor(() => expect(within(live).getByText(/Mismatch — would block\. Demo: transaction differs/)).toBeInTheDocument());
  });

  it("never renders a Sign control in any state (PRD §28.4)", async () => {
    const user = userEvent.setup();
    render(<InteractiveSimulator checkOptions={{ loadVerifier: realLoader }} />);
    for (const name of [/exact match/i, /changed amount/i, /changed recipient/i]) {
      await user.click(screen.getByRole("radio", { name }));
      await user.click(screen.getByRole("button", { name: /run check/i }));
      await waitFor(() => expect(screen.queryByText(/Checking sample/)).toBeNull());
      expect(screen.queryByRole("button", { name: /sign/i })).toBeNull();
    }
  });
});

describe("demoReducer race guards (LP-10)", () => {
  it("ignores parallel runs, stale request ids, and results for another scenario", () => {
    let state = createDemoState("exact-match");
    state = demoReducer(state, { type: "RUN" });
    const firstId = state.latestRequestId;
    expect(demoReducer(state, { type: "RUN" })).toBe(state);

    const changed = demoReducer(state, { type: "SELECT", scenario: "changed-amount" });
    expect(changed.result.status).toBe("idle");
    const stale = demoReducer(changed, {
      type: "SETTLED",
      requestId: firstId,
      result: { source: "controlled-fixture", status: "success", scenario: "exact-match", reasonCodes: [], decoded: null, fingerprint: "x" },
    });
    expect(stale).toBe(changed);
  });

  it("results always carry the controlled-fixture provenance", () => {
    const state = demoReducer(createDemoState(), { type: "RUN" });
    expect(state.result.source).toBe("controlled-fixture");
  });
});
