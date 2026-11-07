"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  advanceOffset,
  copiesNeeded,
  dampMultiplier,
  smoothVelocity,
  targetMultiplier,
  wrapOffset,
} from "./marquee-engine";
import type { MarqueeTrackController } from "./infinite-marquee-track";
import { RAIL_PROFILES, railProfileForWidth, type RailProfile } from "./rail-config";

type TrackState = {
  controller: MarqueeTrackController;
  offset: number;
  multiplier: number;
  width: number;
  hovered: boolean;
  initialised: boolean;
};

/**
 * Drives every track of one rail from a single requestAnimationFrame loop.
 *
 * Per frame it reads only `window.scrollY` (no layout) and writes one
 * transform per track. Widths are measured on resize via ResizeObserver, not
 * per frame. The loop runs only while the section is near the viewport and
 * the tab is visible; stopping and restarting keeps each track's offset, so
 * nothing resets. Reduced motion never starts the loop.
 */
export function useMotionRail(
  sectionRef: RefObject<HTMLElement | null>,
  controllersRef: RefObject<Set<MarqueeTrackController>>,
  pausedRef: RefObject<boolean>,
  revision: number,
  enabled: boolean,
) {
  const offsets = useRef(new WeakMap<HTMLElement, { offset: number; width: number }>());
  useEffect(() => {
    const section = sectionRef.current;
    const controllers = controllersRef.current;
    if (!section || !controllers || controllers.size === 0) return;
    if (!enabled) { section.dataset.railRunning = "false"; return; }
    section.dataset.railRunning = "true";

    const hoverCapable = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let profile: RailProfile = RAIL_PROFILES[railProfileForWidth(window.innerWidth)];
    const tracks: TrackState[] = Array.from(controllers, (controller) => ({
      controller,
      offset: 0,
      multiplier: 1,
      width: 0,
      hovered: false,
      initialised: false,
    }));

    const measure = () => {
      profile = RAIL_PROFILES[railProfileForWidth(window.innerWidth)];
      for (const track of tracks) {
        const width = track.controller.sequence.getBoundingClientRect().width;
        if (!(width > 0)) continue;
        if (!track.initialised) {
          // A rightward track starts one sequence to the left so its leading edge is always covered.
          const saved = offsets.current.get(track.controller.strip);
          track.offset = saved ? saved.offset / saved.width * width : track.controller.direction === "right" ? -width : 0;
          track.initialised = true;
        } else if (track.width > 0) {
          // Keep the same relative position when the sequence width changes.
          track.offset = (track.offset / track.width) * width;
        }
        track.width = width;
        track.offset = wrapOffset(track.offset, width);
        track.controller.setCopies(copiesNeeded(track.controller.viewport.clientWidth, width));
        track.controller.strip.style.transform = `translate3d(${track.offset.toFixed(2)}px, 0, 0)`;
        offsets.current.set(track.controller.strip, { offset: track.offset, width: track.width });
      }
    };

    let measureQueued = 0;
    const queueMeasure = () => {
      if (measureQueued) return;
      measureQueued = requestAnimationFrame(() => {
        measureQueued = 0;
        measure();
      });
    };
    const resizeObserver = new ResizeObserver(queueMeasure);
    for (const track of tracks) {
      resizeObserver.observe(track.controller.sequence);
      resizeObserver.observe(track.controller.viewport);
    }
    measure();

    const hoverCleanups: Array<() => void> = [];
    if (hoverCapable) {
      for (const track of tracks) {
        const enter = () => {
          track.hovered = true;
        };
        const leave = () => {
          track.hovered = false;
        };
        track.controller.viewport.addEventListener("pointerenter", enter);
        track.controller.viewport.addEventListener("pointerleave", leave);
        hoverCleanups.push(() => {
          track.controller.viewport.removeEventListener("pointerenter", enter);
          track.controller.viewport.removeEventListener("pointerleave", leave);
        });
      }
    }

    let raf = 0;
    let active = false;
    let lastTime = 0;
    let lastScrollY = 0;
    let velocity = 0;

    const frame = (now: number) => {
      raf = 0;
      if (!active || document.hidden) return;
      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0;
      lastTime = now;
      const scrollY = window.scrollY;
      // Smooth the scroll *speed* (magnitude): quick up/down scrolling must not cancel out,
      // and the rails never take their direction from the scroll direction anyway.
      if (dt > 0) velocity = smoothVelocity(velocity, Math.abs(scrollY - lastScrollY) / dt, dt);
      lastScrollY = scrollY;

      for (const track of tracks) {
        if (!(track.width > 0)) continue;
        const target = targetMultiplier(profile, velocity, track.hovered, Boolean(pausedRef.current));
        track.multiplier = dampMultiplier(track.multiplier, target, dt, profile);
        track.offset = advanceOffset(track.offset, track.controller.direction, profile[track.controller.speedKey] * track.multiplier, dt, track.width);
        track.controller.strip.style.transform = `translate3d(${track.offset.toFixed(2)}px, 0, 0)`;
        offsets.current.set(track.controller.strip, { offset: track.offset, width: track.width });
      }
      section.dataset.railVelocity = velocity.toFixed(0);
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (raf || !active || document.hidden) return;
      // Fresh baseline: re-entering after a long jump must not read as a huge velocity.
      lastTime = 0;
      lastScrollY = window.scrollY;
      velocity = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const intersection = new IntersectionObserver(
      (entries) => {
        active = entries.some((entry) => entry.isIntersecting);
        section.dataset.railActive = String(active);
        if (active) start();
        else stop();
      },
      { rootMargin: "240px 0px" },
    );
    intersection.observe(section);

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      if (measureQueued) cancelAnimationFrame(measureQueued);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      hoverCleanups.forEach((cleanup) => cleanup());
      delete section.dataset.railActive;
      delete section.dataset.railVelocity;
      section.dataset.railRunning = "false";
    };
  }, [sectionRef, controllersRef, pausedRef, revision, enabled]);
}
