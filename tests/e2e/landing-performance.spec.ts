import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";

type LabMeasurements = {
  lcp: number | null;
  lcpObservations: number;
  cls: number;
  maxInteraction: number | null;
  interactionObservations: number;
};

// Aggregate scripts observed in this single lab journey, including framework and
// lazy motion code. This is NOT the PRD's incremental landing-only gzip budget.
const AGGREGATE_SCRIPT_GZIP_LIMIT = 500 * 1024;

/**
 * LP-19 lab measurements (production build, local server, Chromium, no
 * throttling unless noted). These are LAB numbers, not field p75 CWV — they
 * are recorded to artifacts/perf.json and reported as such.
 */
test.describe("performance budget (LP-19, PRD §18)", () => {
  test("landing LCP, CLS, interaction latency and JS weight", async ({ page }) => {
    const scripts = new Map<string, { decodedBytes: number; gzipBytes: number }>();
    const scriptReads: Promise<void>[] = [];
    const unreadableScripts: string[] = [];
    page.on("response", (response) => {
      if (response.request().resourceType() === "script") {
        scriptReads.push(response.body().then((body) => {
          scripts.set(response.url(), { decodedBytes: body.length, gzipBytes: gzipSync(body, { level: 9 }).length });
        }).catch(() => { unreadableScripts.push(response.url()); }));
      }
    });

    await page.addInitScript(() => {
      const w = window as unknown as { __perf: LabMeasurements };
      w.__perf = { lcp: null, lcpObservations: 0, cls: 0, maxInteraction: null, interactionObservations: 0 };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          w.__perf.lcp = entry.startTime;
          w.__perf.lcpObservations += 1;
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
          if (!entry.hadRecentInput) w.__perf.cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { duration: number; interactionId?: number }>) {
          if (entry.interactionId) {
            w.__perf.maxInteraction = Math.max(w.__perf.maxInteraction ?? 0, entry.duration);
            w.__perf.interactionObservations += 1;
          }
        }
      }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    // Missing observations must never be mistaken for a passing 0 ms LCP.
    await expect.poll(() => page.evaluate(() => (window as unknown as { __perf: LabMeasurements }).__perf.lcpObservations)).toBeGreaterThan(0);
    // Interact once (simulator run) to obtain an interaction latency sample.
    await page.locator("#simulator").scrollIntoViewIfNeeded();
    await page.locator("[data-simulator]").getByRole("button", { name: "Run Check" }).click();
    await expect(page.locator("[data-demo-status]")).toHaveAttribute("data-demo-status", "success");
    await page.waitForTimeout(500);

    const perf = await page.evaluate(() => (window as unknown as { __perf: LabMeasurements }).__perf);
    await Promise.all(scriptReads);
    const scriptSizes = [...scripts.values()];
    const decodedScriptBytes = scriptSizes.reduce((sum, script) => sum + script.decodedBytes, 0);
    const gzipScriptBytes = scriptSizes.reduce((sum, script) => sum + script.gzipBytes, 0);

    mkdirSync("artifacts", { recursive: true });
    writeFileSync(
      "artifacts/perf.json",
      JSON.stringify(
        {
          environment: "Playwright Chromium, local `next start`, viewport 390x844, no CPU/network throttling (lab)",
          lcpMs: perf.lcp === null ? null : Math.round(perf.lcp),
          lcpObservations: perf.lcpObservations,
          cls: Number(perf.cls.toFixed(4)),
          maxInteractionMs: perf.maxInteraction === null ? null : Math.round(perf.maxInteraction),
          interactionObservations: perf.interactionObservations,
          interactionNote: perf.maxInteraction === null ? "No Event Timing entries above the 16 ms reporting threshold; not measured, not 0 ms." : "Maximum observed interaction entry for this journey; not field p75 INP.",
          scriptRequests: scripts.size,
          scriptDecodedBytes: decodedScriptBytes,
          scriptAggregateGzipBytes: gzipScriptBytes,
          scriptAggregateGzipBudgetBytes: AGGREGATE_SCRIPT_GZIP_LIMIT,
          note: "Unique observed script bodies re-compressed with gzip level 9, including shared framework and lazy code. Aggregate lab guard, not network transfer bytes or the incremental landing-only budget.",
        },
        null,
        2,
      ),
    );

    expect(perf.lcpObservations).toBeGreaterThan(0);
    expect(perf.lcp).not.toBeNull();
    expect(perf.lcp!).toBeGreaterThan(0);
    expect(perf.lcp!).toBeLessThan(2500);
    expect(perf.cls).toBeLessThan(0.1);
    if (perf.maxInteraction !== null) expect(perf.maxInteraction).toBeLessThan(200);
    expect(unreadableScripts, "Every observed script body must be measured").toEqual([]);
    expect(scripts.size).toBeGreaterThan(0);
    expect(gzipScriptBytes).toBeGreaterThan(0);
    expect(gzipScriptBytes, "Aggregate gzip of observed framework + landing + lazy scripts (lab)").toBeLessThan(AGGREGATE_SCRIPT_GZIP_LIMIT);
  });
});
