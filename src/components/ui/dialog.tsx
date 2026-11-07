"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Modal dialog — only for flows that must hold focus (e.g. wallet selection). */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-obsidian/80 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 hairline-panel p-6 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)] fade-up",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <DialogPrimitive.Title className="font-heading text-xl font-semibold text-white">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-[0.925rem] text-silver">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">Dialog</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className="-mr-2 -mt-2 inline-flex size-11 items-center justify-center rounded-[var(--radius-control)] text-muted hover:bg-raised hover:text-white"
              aria-label="Close"
            >
              <X className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <div className="mt-5">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
