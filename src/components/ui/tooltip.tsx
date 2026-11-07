"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Accessible tooltip (hover + keyboard focus). Never the only carrier of
 * essential information — critical limits are always visible as text.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={8}
            collisionPadding={12}
            className={cn(
              "z-50 max-w-72 rounded-[var(--radius-control)] border border-hairline bg-raised px-3.5 py-2.5 text-[0.875rem] leading-relaxed text-silver shadow-[0_12px_40px_-12px_rgb(0_0_0/0.7)]",
              className,
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-raised" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
