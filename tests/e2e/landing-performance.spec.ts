import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * LP-19 lab measurements (production build, local server, Chromium, no
 * throttling unless noted). These are LAB numbers, not field p75 CWV — they
 * are recorded to artifacts/perf.json and reported as such.
 */
test.describe("performance budget (LP-19, PRD §18)", () => {
  test("landing LCP, CLS, interaction latency and JS weight", async ({ page }) => {
    const scripts: Array<{ url: string; bytes: number }> = [];
    page.on("response", async (response) => {
      if (response.request().resourceType() === "script") {
        const headers = await response.allHeaders();
        const length = Number(headers["content-length"] ?? 0);
        let bytes = length;
        if (!bytes) {
          try {
            bytes = (await response.body()).length;
          } catch {
            bytes = 0;
          }
        }
        scripts.push({ url: response.url(), bytes });
      }
    });

    await page.addInitScript(() => {
      const w = window as unknown as { __perf: { lcp: number; cls: number; inp: number } };
      w.__perf = { lcp: 0, cls: 0, inp: 0 };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.__perf.lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
          if (!entry.hadRecentInput) w.__perf.cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { duration: number; interactionId?: number }>) {
          if (entry.interactionId) w.__perf.inp = Math.max(w.__perf.inp, entry.duration);
        }
      }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    // Interact once (simulator run) to obtain an interaction latency sample.
    await page.locator("#simulator").scrollIntoViewIfNeeded();
    await page.locator("[data-simulator]").getByRole("button", { name: "Run Check" }).click();
    await expect(page.locator("[data-demo-status]")).toHaveAttribute("data-demo-status", "success");
    await page.waitForTimeout(500);

    const perf = await page.evaluate(() => (window as unknown as { __perf: { lcp: number; cls: number; inp: number } }).__perf);
    const totalScriptBytes = scripts.reduce((sum, s) => sum + s.bytes, 0);

    mkdirSync("artifacts", { recursive: true });
    writeFileSync(
      "artifacts/perf.json",
      JSON.stringify(
        {
          environment: "Playwright Chromium, local `next start`, viewport 390x844, no CPU/network throttling (lab)",
          lcpMs: Math.round(perf.lcp),
          cls: Number(perf.cls.toFixed(4)),
          maxInteractionMs: Math.round(perf.inp),
          scriptRequests: scripts.length,
          scriptBytesTransferred: totalScriptBytes,
          note: "Transferred bytes as served by next start (compressed when content-length is reported).",
        },
        null,
        2,
      ),
    );

    expect(perf.lcp).toBeLessThan(2500);
    expect(perf.cls).toBeLessThan(0.1);
    expect(perf.inp).toBeLessThan(200);
  });
});
