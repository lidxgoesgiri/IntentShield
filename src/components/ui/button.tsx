import { Slot } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "tertiary" | "ghost";
type Size = "md" | "lg" | "sm";

const VARIANTS: Record<Variant, string> = {
  // Primary: solid mint, dark text (PRD §11.5).
  primary:
    "bg-mint text-obsidian hover:bg-[color-mix(in_oklab,var(--color-mint)_88%,white)] active:bg-mint-deep disabled:bg-raised disabled:text-muted",
  // Secondary: silver hairline border on carbon.
  secondary:
    "border border-silver/40 bg-carbon text-white hover:border-silver/80 hover:bg-raised active:bg-carbon disabled:border-hairline disabled:text-muted",
  // Tertiary: text with underline/arrow affordance.
  tertiary:
    "px-0 text-white underline decoration-mint/60 underline-offset-[6px] hover:decoration-mint disabled:text-muted disabled:no-underline",
  ghost: "text-silver hover:bg-raised hover:text-white disabled:text-muted",
};

const SIZES: Record<Size, string> = {
  sm: "min-h-11 px-3.5 text-sm gap-1.5",
  md: "min-h-11 px-5 text-[0.95rem] gap-2",
  lg: "min-h-13 px-6 text-base gap-2.5",
};

export type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: Variant;
  size?: Size;
  /** Render the child element (e.g. a Next.js Link) with button styling. */
  asChild?: boolean;
};

export function buttonClassName(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex select-none items-center justify-center rounded-[var(--radius-control)] font-medium tracking-[-0.005em]",
    "transition-[background-color,border-color,color,transform] duration-150 ease-out active:translate-y-px",
    "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-mint",
    "disabled:pointer-events-auto disabled:translate-y-0",
    VARIANTS[variant],
    variant === "tertiary" ? "min-h-11" : SIZES[size],
    className,
  );
}

export function Button({ variant = "primary", size = "md", asChild = false, className, type, ...props }: ButtonProps) {
  if (asChild) {
    return <Slot.Root className={buttonClassName(variant, size, className)} {...props} />;
  }
  return <button type={type ?? "button"} className={buttonClassName(variant, size, className)} {...props} />;
}
