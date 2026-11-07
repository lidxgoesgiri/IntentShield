import type { DemoResult, DemoScenario } from "./types";

/** Demo-only reducer (PRD §28.4). It can never produce or touch real transfer state. */
export type DemoMachineState = Readonly<{
  scenario: DemoScenario;
  /** Incremented per run; only the latest run may settle (race guard). */
  latestRequestId: number;
  result: DemoResult;
}>;

export type DemoEvent =
  | { type: "SELECT"; scenario: DemoScenario }
  | { type: "RUN" }
  | { type: "SETTLED"; requestId: number; result: Exclude<DemoResult, { status: "idle" | "loading" }> }
  | { type: "RESET" };

export function createDemoState(scenario: DemoScenario = "exact-match"): DemoMachineState {
  return { scenario, latestRequestId: 0, result: { source: "controlled-fixture", status: "idle", scenario } };
}

export function demoReducer(state: DemoMachineState, event: DemoEvent): DemoMachineState {
  switch (event.type) {
    case "SELECT": {
      // Changing the sample invalidates any previous or in-flight run.
      if (event.scenario === state.scenario && state.result.status === "idle") return state;
      return {
        scenario: event.scenario,
        latestRequestId: state.latestRequestId + 1,
        result: { source: "controlled-fixture", status: "idle", scenario: event.scenario },
      };
    }
    case "RUN": {
      // No parallel runs: a second Run while loading is ignored.
      if (state.result.status === "loading") return state;
      const requestId = state.latestRequestId + 1;
      return {
        ...state,
        latestRequestId: requestId,
        result: { source: "controlled-fixture", status: "loading", scenario: state.scenario, requestId },
      };
    }
    case "SETTLED": {
      if (event.requestId !== state.latestRequestId || state.result.status !== "loading") return state;
      if (event.result.scenario !== state.scenario) return state;
      return { ...state, result: event.result };
    }
    case "RESET": {
      return {
        scenario: state.scenario,
        latestRequestId: state.latestRequestId + 1,
        result: { source: "controlled-fixture", status: "idle", scenario: state.scenario },
      };
    }
  }
}
