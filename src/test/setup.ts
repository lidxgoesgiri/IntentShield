import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

afterEach(async () => {
  // Only component tests (jsdom) render React trees; cleanup is a no-op otherwise.
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
