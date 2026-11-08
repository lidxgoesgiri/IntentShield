"use client";

import { useEffect, useRef } from "react";
import { MOTION_CONDITIONS } from "../motion/motion-preferences";
import { useDecorativeMotion } from "../motion/motion-context";

type Drop = {
  x: number;
  y: number;
  length: number;
  speed: number;
  alpha: number;
  width: number;
  layer: 0 | 1 | 2;
  tinted: boolean;
};

/** Far → near: slower, shorter, dimmer and thinner in the distance. */
const LAYERS = [
  { share: 0.5, speed: [260, 420], length: [10, 22], alpha: [0.05, 0.1], width: 0.6 },
  { share: 0.35, speed: [480, 700], length: [22, 40], alpha: [0.08, 0.15], width: 0.8 },
  { share: 0.15, speed: [780, 1040], length: [40, 70], alpha: [0.1, 0.2], width: 1.05 },
] as const;

/** Slight diagonal (radians), like rain falling through still air with a light draft. */
const SLANT = 0.13;

function between([min, max]: readonly [number, number], random: () => number): number {
  return min + (max - min) * random();
}

/** Small deterministic PRNG so the static (reduced-motion) frame is stable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createDrop(width: number, height: number, random: () => number, anywhere: boolean): Drop {
  const roll = random();
  const layerIndex: 0 | 1 | 2 = roll < LAYERS[0].share ? 0 : roll < LAYERS[0].share + LAYERS[1].share ? 1 : 2;
  const layer = LAYERS[layerIndex];
  return {
    x: random() * (width + height * SLANT) - height * SLANT * 0.5,
    y: anywhere ? random() * height : -between(layer.length, random) - random() * height * 0.25,
    length: between(layer.length, random),
    speed: between(layer.speed, random),
    alpha: between(layer.alpha, random),
    width: layer.width,
    layer: layerIndex,
    tinted: layerIndex > 0 && random() < 0.12,
  };
}

/**
 * Atmospheric rain behind the landing page: thin, translucent streaks in three
 * depth layers, a few catching the mint light. Purely decorative: a fixed,
 * pointer-transparent canvas. Intensity follows `data-atmosphere` on the
 * section in view; rendering pauses in hidden tabs, adapts to viewport size,
 * caps device-pixel ratio, and draws one still frame for reduced motion.
 */
export function AtmosphericRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { enabled } = useDecorativeMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;

    const reduced = !enabled;
    const random = reduced ? mulberry32(7) : Math.random;
    let width = 0;
    let height = 0;
    let drops: Drop[] = [];
    let raf = 0;
    let last = 0;
    let lastPaint = 0;
    let intensity = 1;
    let targetIntensity = 1;

    const resize = () => {
      const desktop = window.matchMedia(MOTION_CONDITIONS.desktop).matches;
      const dpr = Math.min(window.devicePixelRatio || 1, desktop ? 1.5 : 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.round(Math.min(desktop ? 130 : 48, Math.max(24, (width * height) / (desktop ? 8500 : 12500))));
      drops = Array.from({ length: target }, () => createDrop(width, height, random, true));
    };

    const readTargetIntensity = () => {
      const probe = document.elementFromPoint(width / 2, height * 0.45);
      const section = probe?.closest<HTMLElement>("[data-atmosphere]");
      const value = section ? Number.parseFloat(section.dataset.atmosphere ?? "") : Number.NaN;
      targetIntensity = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.35;
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.lineCap = "round";
      for (let layer = 0; layer < 3; layer += 1) {
        for (const drop of drops) {
          if (drop.layer !== layer) continue;
          const alpha = drop.alpha * intensity;
          if (alpha < 0.004) continue;
          context.strokeStyle = drop.tinted ? `rgba(100, 232, 199, ${(alpha * 1.6).toFixed(3)})` : `rgba(215, 226, 223, ${alpha.toFixed(3)})`;
          context.lineWidth = drop.width;
          context.beginPath();
          context.moveTo(drop.x, drop.y);
          context.lineTo(drop.x - drop.length * SLANT, drop.y - drop.length);
          context.stroke();
        }
      }
    };

    const step = (now: number) => {
      raf = 0;
      if (document.hidden) return;
      // Decorative rain needs at most 30 paints/sec, including high-refresh displays.
      if (now - lastPaint < 33) { raf = requestAnimationFrame(step); return; }
      lastPaint = now;
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;
      intensity += (targetIntensity - intensity) * Math.min(1, dt * 2.5);
      for (const drop of drops) {
        drop.y += drop.speed * dt;
        drop.x += drop.speed * SLANT * dt;
        if (drop.y - drop.length > height || drop.x - drop.length * SLANT > width + 40) {
          Object.assign(drop, createDrop(width, height, random, false));
        }
      }
      draw();
      raf = requestAnimationFrame(step);
    };

    const start = () => {
      if (reduced) return;
      if (!raf && !document.hidden) {
        last = 0;
        raf = requestAnimationFrame(step);
      }
    };

    resize();
    readTargetIntensity();
    intensity = targetIntensity;
    if (reduced) {
      intensity = targetIntensity * 0.8;
      draw();
    }

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resize();
        if (reduced) draw();
      }, 150);
    };
    let scrollFrame = 0;
    const onScroll = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        readTargetIntensity();
        if (reduced) {
          intensity = targetIntensity * 0.8;
          draw();
        }
      });
    };
    const onVisibility = () => {
      if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; }
      else start();
    };

    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  return <canvas ref={canvasRef} className="atmospheric-rain" aria-hidden="true" />;
}
