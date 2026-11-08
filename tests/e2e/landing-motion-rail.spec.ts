import { expect, test, type Page } from "@playwright/test";

/**
 * Interactive dual-direction rail (stack interlude). Speeds are measured from
 * the real transforms frame by frame, unwrapping the loop by one sequence
 * width, so a visual jump would show up as a large single-frame delta.
 */

type Sample = { speeds: [number, number]; maxFrameDelta: [number, number]; withinBounds: boolean };

async function sampleRail(page: Page, ms: number, during?: "scroll"): Promise<Sample> {
  return page.evaluate(
    async ({ ms, during }) => {
      const strips = [...document.querySelectorAll<HTMLElement>("#stack .rail-strip")];
      const widths = strips.map((strip) => strip.querySelector<HTMLElement>(".rail-sequence")!.getBoundingClientRect().width);
      const read = () => strips.map((strip) => new DOMMatrix(getComputedStyle(strip).transform).m41);
      let previous = read();
      const travelled = [0, 0];
      const maxDelta = [0, 0];
      let withinBounds = true;
      const start = performance.now();
      let direction = 1;
      await new Promise<void>((resolve) => {
        const tick = (now: number) => {
          if (during === "scroll") {
            // Fast down/up flicks; "instant" so the page's smooth-scroll CSS cannot absorb them.
            window.scrollBy({ top: 70 * direction, behavior: "instant" });
            direction *= -1;
          }
          const current = read();
          current.forEach((value, index) => {
            const width = widths[index]!;
            let delta = value - previous[index]!;
            if (delta > width / 2) delta -= width;
            if (delta < -width / 2) delta += width;
            travelled[index]! += delta;
            maxDelta[index] = Math.max(maxDelta[index]!, Math.abs(delta));
            if (value > 0.5 || value < -width - 0.5) withinBounds = false;
          });
          previous = current;
          if (now - start < ms) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      const seconds = (performance.now() - start) / 1000;
      return {
        speeds: [travelled[0]! / seconds, travelled[1]! / seconds] as [number, number],
        maxFrameDelta: maxDelta as [number, number],
        withinBounds,
      };
    },
    { ms, during },
  );
}

async function showRail(page: Page) {
  await page.goto("/");
  await page.locator('#stack [data-rail-row="lower"]').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await expect(page.locator("#stack")).toHaveAttribute("data-rail-active", "true");
  // Let the entrance finish and the damping settle at baseline.
  await page.waitForTimeout(2200);
}

test.describe("stack interlude — dual-direction motion rail", () => {
  test("sits between How It Works and the product with real stack and capability content", async ({ page }) => {
    await page.goto("/");
    const ids = await page.locator("main#main > section").evaluateAll((sections) => sections.map((s) => s.id));
    expect(ids.indexOf("stack")).toBe(ids.indexOf("how-it-works") + 1);
    expect(ids.indexOf("product")).toBe(ids.indexOf("stack") + 1);
    const tech = page.getByRole("list", { name: "Technologies this build uses" });
    for (const name of ["Solana", "OpenRouter", "Next.js", "TypeScript", "Vercel", "Tailwind CSS"]) {
      await expect(tech.getByText(name, { exact: true })).toBeAttached();
    }
    const capabilities = page.getByRole("list", { name: "What IntentShield checks" });
    for (const name of ["Simulation", "Verification", "AI Explanation", "Devnet", "Transaction Inspection", "Intent Matching"]) {
      await expect(capabilities.getByText(name, { exact: true })).toBeAttached();
    }
    // Duplicate copies are hidden from assistive tech and focus.
    const copies = page.locator("#stack [data-rail-copy]");
    expect(await copies.count()).toBeGreaterThan(0);
    for (const copy of await copies.all()) {
      await expect(copy).toHaveAttribute("aria-hidden", "true");
      await expect(copy).toHaveAttribute("inert", "");
    }
  });

  test("upper track runs right→left and lower left→right, seamlessly, at pixel-based speed", async ({ page }) => {
    await showRail(page);
    const sample = await sampleRail(page, 1500);
    expect(sample.speeds[0]).toBeLessThan(-25);
    expect(sample.speeds[0]).toBeGreaterThan(-75);
    expect(sample.speeds[1]).toBeGreaterThan(35);
    expect(sample.speeds[1]).toBeLessThan(95);
    // No teleport: per-frame movement stays tiny and offsets stay inside one sequence.
    expect(sample.maxFrameDelta[0]).toBeLessThan(8);
    expect(sample.maxFrameDelta[1]).toBeLessThan(8);
    expect(sample.withinBounds).toBe(true);
  });

  test("scroll velocity speeds both tracks up without reversing them, then settles back smoothly", async ({ page }) => {
    await showRail(page);
    const baseline = await sampleRail(page, 800);
    const scrolling = await sampleRail(page, 900, "scroll");
    expect(Math.abs(scrolling.speeds[0])).toBeGreaterThan(Math.abs(baseline.speeds[0]) * 1.4);
    expect(Math.abs(scrolling.speeds[1])).toBeGreaterThan(Math.abs(baseline.speeds[1]) * 1.4);
    expect(Math.sign(scrolling.speeds[0])).toBe(-1);
    expect(Math.sign(scrolling.speeds[1])).toBe(1);
    // Capped and continuous even while boosted.
    expect(scrolling.maxFrameDelta[0]).toBeLessThan(12);
    expect(scrolling.maxFrameDelta[1]).toBeLessThan(12);
    // Abrupt stop: speed eases back to its baseline instead of snapping.
    await page.waitForTimeout(2600);
    const settled = await sampleRail(page, 800);
    expect(Math.abs(settled.speeds[0])).toBeLessThan(Math.abs(baseline.speeds[0]) * 1.35);
    expect(Math.abs(settled.speeds[1])).toBeLessThan(Math.abs(baseline.speeds[1]) * 1.35);
    expect(Math.sign(settled.speeds[0])).toBe(-1);
    expect(Math.sign(settled.speeds[1])).toBe(1);
  });

  test("hovering a track slows it without stopping it, and the item gains emphasis", async ({ page }) => {
    await showRail(page);
    const baseline = await sampleRail(page, 700);
    await page.locator('#stack [data-rail-row="upper"] .rail-viewport').hover({ position: { x: 400, y: 30 } });
    await page.waitForTimeout(1200);
    const hovered = await sampleRail(page, 800);
    expect(Math.abs(hovered.speeds[0])).toBeLessThan(Math.abs(baseline.speeds[0]) * 0.6);
    expect(Math.abs(hovered.speeds[0])).toBeGreaterThan(1);
    expect(Math.abs(hovered.speeds[1])).toBeGreaterThan(Math.abs(baseline.speeds[1]) * 0.7);
  });

  test("the landing has no pause control; motion follows the reduced-motion preference", async ({ page }) => {
    await showRail(page);
    // Owner decision (8 Nov 2026): no in-page pause control, for a cleaner page.
    await expect(page.getByRole("button", { name: /pause|resume/i })).toHaveCount(0);
    await expect(page.locator("#stack [data-rail-head] button")).toHaveCount(0);
    const moving = await sampleRail(page, 700);
    expect(moving.speeds[0]).toBeLessThan(-20);
    expect(moving.speeds[1]).toBeGreaterThan(20);
  });

  test("reduced motion: static rails, every item visible, no duplicates", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    await page.locator("#stack").scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const transforms = await page.locator("#stack .rail-strip").evaluateAll((strips) => strips.map((s) => getComputedStyle(s).transform));
    for (const transform of transforms) expect(transform).toBe("none");
    for (const name of ["Simulation", "Verification", "AI Explanation", "Devnet", "Transaction Inspection", "Intent Matching", "Solana", "Tailwind CSS"]) {
      await expect(page.locator("#stack .rail-sequence:not([data-rail-copy])").getByText(name, { exact: true })).toBeVisible();
    }
    await expect(page.locator("#stack [data-rail-copy]").first()).toBeHidden();
    await context.close();
  });

  test("resizing keeps the loop covered with no page overflow", async ({ page }) => {
    await showRail(page);
    for (const width of [600, 1600, 375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(500);
      const state = await page.evaluate(() => {
        const strips = [...document.querySelectorAll<HTMLElement>("#stack .rail-strip")];
        return {
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          covered: strips.every((strip) => {
            const sequence = strip.querySelector<HTMLElement>(".rail-sequence")!.getBoundingClientRect().width;
            return strip.getBoundingClientRect().width >= document.documentElement.clientWidth + sequence - 1;
          }),
        };
      });
      expect(state.overflow, `width ${width}`).toBe(false);
      expect(state.covered, `width ${width}`).toBe(true);
    }
  });

  test("route changes and remounts leave no listeners or animation loops behind", async ({ page }) => {
    await page.addInitScript(() => {
      const counts = { scroll: 0, visibilitychange: 0, raf: 0 };
      (window as unknown as { __listeners: typeof counts }).__listeners = counts;
      const track = (target: EventTarget) => {
        const add = target.addEventListener.bind(target);
        const remove = target.removeEventListener.bind(target);
        target.addEventListener = (type: string, ...rest: [EventListenerOrEventListenerObject, (boolean | AddEventListenerOptions)?]) => {
          if (type in counts) counts[type as "scroll"] += 1;
          return add(type, ...rest);
        };
        target.removeEventListener = (type: string, ...rest: [EventListenerOrEventListenerObject, (boolean | EventListenerOptions)?]) => {
          if (type in counts) counts[type as "scroll"] -= 1;
          return remove(type, ...rest);
        };
      };
      track(window);
      track(document);
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => {
        counts.raf += 1;
        return raf(callback);
      };
    });
    type Counts = { scroll: number; visibilitychange: number; raf: number };
    const counts = () => page.evaluate(() => ({ ...(window as unknown as { __listeners: Counts }).__listeners }));
    const rafRate = async () => {
      const before = (await counts()).raf;
      await page.waitForTimeout(1000);
      return (await counts()).raf - before;
    };
    const onLanding = async () => {
      await expect(page).toHaveURL((url) => url.pathname === "/");
      await page.locator("#stack").scrollIntoViewIfNeeded();
      await expect(page.locator("#stack")).toHaveAttribute("data-rail-active", "true");
      await page.waitForTimeout(500);
    };
    const toWorkspace = async () => {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.getByRole("link", { name: /Launch IntentShield/ }).first().click();
      await expect(page).toHaveURL((url) => url.pathname === "/app");
      await page.waitForTimeout(900);
    };

    // One document throughout: client-side navigation mounts and unmounts the landing repeatedly.
    // The baseline is taken after one full cycle, because GSAP's ScrollTrigger registers a
    // single page-lifetime scroll listener the first time it loads (a singleton, not a leak).
    await page.goto("/");
    await onLanding();
    await toWorkspace();
    await page.goBack();
    await onLanding();
    const landing = await counts();
    await toWorkspace();
    const workspace = await counts();
    const workspaceRate = await rafRate();

    for (let round = 0; round < 3; round += 1) {
      await page.goBack();
      await onLanding();
      const again = await counts();
      expect(again.scroll, `landing scroll listeners, round ${round}`).toBe(landing.scroll);
      expect(again.visibilitychange, `landing visibility listeners, round ${round}`).toBe(landing.visibilitychange);
      await toWorkspace();
      const back = await counts();
      expect(back.scroll, `workspace scroll listeners, round ${round}`).toBe(workspace.scroll);
      expect(back.visibilitychange, `workspace visibility listeners, round ${round}`).toBe(workspace.visibilitychange);
    }
    // No leaked rail, ribbon or rain loop keeps requesting frames after the landing unmounts.
    expect(await rafRate()).toBeLessThanOrEqual(workspaceRate + 5);
  });
});
