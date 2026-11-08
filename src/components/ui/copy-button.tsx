"use client";

import { Check, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Copy a full value (address/signature) with visible + announced feedback. */
export function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const [feedback, setFeedback] = useState<{ value: string; state: "copied" | "failed" } | null>(null);
  const state = feedback?.value === value ? feedback.state : "idle";
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const operation = useRef(0);

  useEffect(() => () => {
    operation.current += 1;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    const id = ++operation.current;
    let result: "copied" | "failed";
    try {
      await navigator.clipboard.writeText(value);
      result = "copied";
    } catch {
      result = "failed";
    }
    if (id !== operation.current) return;
    setFeedback({ value, state: result });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeedback(null), 1800);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-muted transition-colors hover:bg-raised hover:text-white",
        state === "failed" && "w-auto gap-2 px-2 text-danger",
        className,
      )}
      aria-label={state === "copied" ? `${label} copied` : state === "failed" ? `Copy failed — retry ${label}` : `Copy ${label}`}
    >
      {state === "copied" ? <Check className="size-4 text-mint" aria-hidden /> : state === "failed" ? <><TriangleAlert className="size-4" aria-hidden /><span className="text-[0.8125rem]">Copy failed</span></> : <Copy className="size-4" aria-hidden />}
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : ""}
      </span>
    </button>
  );
}
