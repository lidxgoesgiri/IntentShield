import { useId } from "react";
import { cn } from "@/lib/utils";
import { shieldPath, shieldVertices } from "../visuals/shield-geometry";

const CX = 300;
const CY = 300;

/**
 * Hero Security Core — original layered SVG (PRD §10.1 S01, §11.6). Pure
 * presentation: aria-hidden, no pointer events, no data, no state.
 */
export function HeroSecurityCore({ className }: { className?: string }) {
  // Unique gradient ids per instance: the core renders twice (desktop + mobile
  // layouts) and a url(#id) resolving into a display:none subtree would not paint.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ids = { glow: `${uid}-glow`, rim: `${uid}-rim`, facet: `${uid}-facet`, mark: `${uid}-mark` };
  const outer = shieldVertices(CX, CY, 430);
  const mid = shieldVertices(CX, CY, 330);
  const inner = shieldVertices(CX, CY, 236);
  const ticks = Array.from({ length: 72 }, (_, i) => i);

  return (
    <svg viewBox="0 0 600 600" className={cn("landing-ambient h-full w-full", className)} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={ids.glow} cx="50%" cy="48%" r="50%">
          <stop offset="0" stopColor="#64e8c7" stopOpacity="0.16" />
          <stop offset="0.45" stopColor="#64e8c7" stopOpacity="0.05" />
          <stop offset="1" stopColor="#64e8c7" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ids.rim} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#d7e2df" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#64e8c7" />
          <stop offset="1" stopColor="#30423e" />
        </linearGradient>
        <linearGradient id={ids.facet} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#202a2d" stopOpacity="0.9" />
          <stop offset="1" stopColor="#080d10" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={ids.mark} x1="20" y1="20" x2="90" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3a9e86" />
          <stop offset="0.55" stopColor="#64e8c7" />
          <stop offset="1" stopColor="#f3f7f5" />
        </linearGradient>
      </defs>

      <g className="core-reveal">
        <circle cx={CX} cy={CY} r="292" fill={`url(#${ids.glow})`} />

        {/* Instrument dial: precision ticks, never data. */}
        <circle cx={CX} cy={CY} r="268" fill="none" stroke="#30423e" strokeWidth="1" />
        <g stroke="#30423e">
          {ticks.map((i) => {
            const angle = (i * 5 * Math.PI) / 180;
            const long = i % 6 === 0;
            const r1 = 268;
            const r2 = long ? 252 : 260;
            return (
              <line
                key={i}
                x1={Math.round((CX + r1 * Math.cos(angle)) * 100) / 100}
                y1={Math.round((CY + r1 * Math.sin(angle)) * 100) / 100}
                x2={Math.round((CX + r2 * Math.cos(angle)) * 100) / 100}
                y2={Math.round((CY + r2 * Math.sin(angle)) * 100) / 100}
                strokeWidth={long ? 1.5 : 1}
                strokeOpacity={long ? 0.9 : 0.6}
              />
            );
          })}
        </g>

        {/* Faceted shield layers */}
        <path d={shieldPath(CX, CY, 430)} fill="none" stroke="#30423e" strokeWidth="1" strokeDasharray="2 6" />
        <path d={shieldPath(CX, CY, 330)} fill={`url(#${ids.facet})`} stroke="#30423e" strokeWidth="1" />
        <g stroke="#30423e" strokeWidth="1" strokeOpacity="0.85">
          {mid.map(([x, y], i) => {
            const [ox, oy] = outer[i] ?? [x, y];
            const [ix, iy] = inner[i] ?? [x, y];
            return (
              <g key={i}>
                <line x1={x} y1={y} x2={ox} y2={oy} strokeOpacity="0.5" />
                <line x1={x} y1={y} x2={ix} y2={iy} />
              </g>
            );
          })}
        </g>
        <path d={shieldPath(CX, CY, 236)} fill="#0b1215" stroke={`url(#${ids.rim})`} strokeWidth="1.6" />
        <path className="core-contour" d={shieldPath(CX, CY, 236)} fill="none" stroke="#64e8c7" strokeWidth="1.4" strokeLinecap="round" />

        {/* Intent glyph: heart closed by a check (from the IntentShield mark). */}
        <g transform={`translate(${CX - 62} ${CY - 66}) scale(1.24)`} fill="none" stroke={`url(#${ids.mark})`} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M84.3 36.6 C68.5 40.5 57.5 50.5 50 64 C46.5 56.5 41.5 50.5 35 50.5 C28 50.5 23.8 56 24.8 62.5 C26.6 72.5 37.5 84 50 92" />
          <path d="M84.6 40 C83.6 62 71 80 50 92" strokeOpacity="0.55" />
        </g>
      </g>
    </svg>
  );
}
