// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveModelBadge, ModelSwitcher } from "@/features/intent/components/model-switcher";
import { useAiModels } from "@/features/intent/hooks/use-ai-models";

const MODELS = {
  available: true,
  defaultModel: "a/one",
  models: [
    { id: "a/one", label: "One · A", isDefault: true },
    { id: "b/two", label: "Two · B", isDefault: false },
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

describe("ModelSwitcher (workspace)", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("selects the server default and shows it as the active model", async () => {
    stubModels(MODELS);
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("a/one"));
    expect(screen.getByRole("combobox", { name: "AI model" })).toHaveValue("a/one");
    expect(screen.getByRole("status", { name: "Active AI model: One · A" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "One · A — default" })).toBeInTheDocument();
  });

  it("switching updates the indicator and persists the choice", async () => {
    stubModels(MODELS);
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("a/one"));
    await user.selectOptions(screen.getByRole("combobox", { name: "AI model" }), "b/two");
    expect(screen.getByTestId("selected")).toHaveTextContent("b/two");
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
    await waitFor(() => expect(screen.getByRole("option", { name: "Server default model" })).toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: "AI model" })).toBeDisabled();
    expect(screen.getByTestId("selected")).toHaveTextContent("none");
  });

  it("is disabled while the draft is locked", async () => {
    stubModels(MODELS);
    render(<Harness disabled />);
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("a/one"));
    expect(screen.getByRole("combobox", { name: "AI model" })).toBeDisabled();
  });
});
