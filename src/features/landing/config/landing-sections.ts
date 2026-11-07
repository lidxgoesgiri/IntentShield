/**
 * Client-safe navigation constants (no env/zod imports, so client islands such
 * as the mobile menu stay lightweight). Anchors map to real section ids (PRD §31).
 */
export const LANDING_SECTIONS = [
  { id: "hero", index: "01", label: "Know what you sign" },
  { id: "problem", index: "02", label: "The problem" },
  { id: "simulator", index: "03", label: "Simulator" },
  { id: "how-it-works", index: "04", label: "How it works" },
  { id: "product", index: "05", label: "Product" },
  { id: "security", index: "06", label: "Security" },
  { id: "developers", index: "07", label: "Developers" },
  { id: "get-started", index: "08", label: "Get started" },
] as const;

export type LandingSectionId = (typeof LANDING_SECTIONS)[number]["id"];

export const HEADER_ANCHORS = [
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#security", label: "Security" },
  { href: "/#developers", label: "Developers" },
] as const;
