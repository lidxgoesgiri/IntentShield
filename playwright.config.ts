import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

/**
 * E2E runs against a PRODUCTION build (`next build && next start`) so CSP,
 * bundling and server routes match what ships. No AI key is configured, so
 * the real AI endpoint answers 503 and the manual fallback is exercised.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Optional installed Chromium channel for local QA; CI uses Playwright's pinned browser.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.E2E_BROWSER_CHANNEL } }],
  webServer: {
    command: process.env.E2E_SKIP_BUILD ? `npx next start -p ${PORT}` : `npm run build && npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_SOLANA_RPC_URL: "https://api.devnet.solana.com",
      NEXT_PUBLIC_SOLANA_CLUSTER: "devnet",
      NEXT_PUBLIC_APP_URL: BASE_URL,
      NEXT_PUBLIC_REPOSITORY_URL: "https://github.com/lidxgoesgiri/IntentShield",
      // Deterministic E2E: an empty value is NOT overridden by .env.local, so no
      // real AI provider is ever called from the test suite.
      OPENROUTER_API_KEY: "",
      OPENROUTER_MODEL: "",
      OPENROUTER_MODELS: "",
    },
  },
});
