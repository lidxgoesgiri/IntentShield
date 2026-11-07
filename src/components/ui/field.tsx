import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

const CONTROL =
  "w-full rounded-[var(--radius-control)] border bg-obsidian/70 px-3.5 text-white placeholder:text-muted/80 transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:cursor-not-allowed disabled:opacity-60";

export function Field({
  id,
  label,
  hint,
  error,
  children,
  aside,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null | undefined;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[0.9rem] font-medium text-white">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="type-caption">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-[0.875rem] text-danger">
          <span aria-hidden>✕ </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, hasError: boolean, hasHint: boolean): string | undefined {
  if (hasError) return `${id}-error`;
  if (hasHint) return `${id}-hint`;
  return undefined;
}

export function Input({ className, invalid, ...props }: ComponentPropsWithoutRef<"input"> & { invalid?: boolean }) {
  return (
    <input
      className={cn(CONTROL, "min-h-12", invalid ? "border-danger/70" : "border-hairline hover:border-silver/40", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Textarea({ className, invalid, ...props }: ComponentPropsWithoutRef<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      className={cn(CONTROL, "py-3 leading-relaxed", invalid ? "border-danger/70" : "border-hairline hover:border-silver/40", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}
