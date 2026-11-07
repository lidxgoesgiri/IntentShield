import { RibbonSegment } from "./ribbon-segment";

/** Horizontal desktop path through three nodes at x = 200, 600, 1000 (of 1200). */
const DESKTOP_PATH =
  "M0 104 C90 104 120 64 200 64 C300 64 360 24 470 40 C540 50 560 64 600 64 C660 64 720 106 820 100 C900 95 930 64 1000 64 C1080 64 1130 44 1200 48";

/** Vertical mobile path (stepped, never offscreen). */
const MOBILE_PATH = "M24 0 C24 40 24 60 24 96 C24 140 34 170 24 210 C16 250 24 300 24 340 C24 380 30 410 24 450 L24 520";

export const HOW_NODES_DESKTOP = [
  { id: "validation", x: 200, y: 64 },
  { id: "simulation", x: 600, y: 64 },
  { id: "explanation", x: 1000, y: 64 },
] as const;

/**
 * The S04 ribbon: validation → simulation → AI explanation. Nodes are
 * labeled in the DOM next to the steps; this SVG is purely decorative.
 */
export function EnergyRibbon() {
  return (
    <>
      <div className="relative hidden h-[128px] lg:block">
        <RibbonSegment name="how-desktop" d={DESKTOP_PATH} viewBox="0 0 1200 128" className="absolute inset-0 h-full w-full" strokeWidth={2.2} />
        <svg viewBox="0 0 1200 128" className="ribbon-svg absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
          {HOW_NODES_DESKTOP.map((node) => (
            <g key={node.id}>
              <circle cx={node.x} cy={node.y} r="22" fill="#080d10" stroke="#30423e" strokeWidth="1" />
              <circle className="ribbon-node" data-ribbon-node={node.id} data-active="true" cx={node.x} cy={node.y} r="6" fill="#64e8c7" stroke="#64e8c7" />
            </g>
          ))}
        </svg>
      </div>
      <RibbonSegment
        name="how-mobile"
        d={MOBILE_PATH}
        viewBox="0 0 48 520"
        preserveAspectRatio="none"
        className="absolute bottom-0 left-0 top-0 h-full w-12 lg:hidden"
        strokeWidth={2}
      />
    </>
  );
}
