// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveModelBadge, ModelSwitcher } from "@/features/intent/components/model-switcher";
import { useAiModels } from "@/features/intent/hooks/use-ai-models";

const MODELS = {
  available: true,
  defaultModel: "a/one",
  models: [
    { id: "a/one", label: "One · A", isDefault: true, name: "One", provider: "A", detail: null },
    { id: "b/two", label: "Two · B", isDefault: false, name: "Two", provider: "B", detail: null },
  ],
};

function Harness({ disabled = false }: { disabled?: boolean }) {
  const ai = useAiModels();
  return (
    <>
      <ActiveModelBadge ai={ai} />
      <ModelSwitcher ai={ai} disabled={disabled} />
      <output data-testid="selected">{ai.selectedModel ?? "none"}</output>
    </>
  );
}

function stubModels(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => (ok ? new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }) : new Response("x", { status: 500 }))),
  );
}

/** jsdom gaps that Radix Select relies on. */
beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => undefined;
  proto.setPointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("ModelSwitcher (workspace)", () => {
  beforeEach(() => window.localStorage.clear());

  it("falls back to the plain label for older payloads without display fields", async () => {
    stubModels({ available: true, defaultModel: "a/one", models: [{ id: "a/one", label: "One · A", isDefault: true }] });
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "AI model" })).toHaveTextContent("One · A"));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("selects the server default and shows it as the active model", async () => {
    stubModels(MODELS);
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("a/one"));
    const trigger = screen.getByRole("combobox", { name: "AI model" });
    expect(trigger).toHaveTextContent("One");
    expect(trigger).toHaveTextContent("default");
    expect(screen.getByRole("status", { name: "Active AI model: One · A" })).toBeInTheDocument();

    const user = userEvent.setup();
    trigger.focus();
    await user.keyboard("{Enter}");
    const option = await screen.findByRole("option", { name: "One" });
    expect(option).toHaveAttribute("data-state", "checked");
    expect(screen.getByRole("option", { name: "Two" })).toHaveAttribute("data-state", "unchecked");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("switching updates the indicator and persists the choice", async () => {
    stubModels(MODELS);
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("a/one"));
    screen.getByRole("combobox", { name: "AI model" }).focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("listbox");
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("b/two"));
    expect(screen.getByRole("status", { name: "Active AI model: Two · B" })).toBeInTheDocument();
    expect(window.localStorage.getItem("intentshield:ai-model")).toBe("b/two");
  });

  it("restores a stored choice only if the server still offers it", async () => {
    window.localStorage.setItem("intentshield:ai-model", "b/two");
    stubModels(MODELS);
    const first = render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("b/two"));
    first.unmount();

    window.localStorage.setItem("intentshield:ai-model", "removed/model");
    stubModels(MODELS);
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("a/one"));
  });

  it("shows a manual-entry message when AI is not configured", async () => {
    stubModels({ available: false, defaultModel: null, models: [] });
    render(<Harness />);
    await waitFor(() => expect(screen.getByText(/AI drafting is not configured/)).toBeInTheDocument());
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("status", { name: "AI drafting is off" })).toBeInTheDocument();
  });

  it("falls back to the server default when the list cannot be loaded", async () => {
    stubModels(null, false);
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "AI model" })).toHaveTextContent("Server default model"));
    expect(screen.getByRole("combobox", { name: "AI model" })).toBeDisabled();
    expect(screen.getByTestId("selected")).toHaveTextContent("none");
    expect(screen.getByText(/Model list unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/manual entry remains available/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry model list" })).toBeEnabled();
  });

  it("retries a failed model list without reloading and restores an allowlisted preference", async () => {
    window.localStorage.setItem("intentshield:ai-model", "b/two");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("temporary error", { status: 503 }))
      .mockResolvedValueOnce(Response.json(MODELS));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(await screen.findByRole("button", { name: "Retry model list" }));
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("b/two"));
    expect(screen.getByRole("combobox", { name: "AI model" })).toBeEnabled();
    expect(screen.queryByText(/Model list unavailable/)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is disabled while the draft is locked", async () => {
    stubModels(MODELS);
    render(<Harness disabled />);
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("a/one"));
    expect(screen.getByRole("combobox", { name: "AI model" })).toBeDisabled();
  });
});
