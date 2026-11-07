"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { HEADER_ANCHORS } from "../config/landing-sections";

/** Accessible mobile menu: button + disclosure panel, Escape closes, focus returns. */
export function MobileNav({ repositoryUrl }: { repositoryUrl: string | null }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-11 items-center justify-center rounded-[var(--radius-control)] border border-hairline text-white hover:bg-raised"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>
      <div
        id={panelId}
        ref={panelRef}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-hairline bg-obsidian/97 backdrop-blur-md"
      >
        <nav aria-label="Mobile" className="page-container flex flex-col py-3">
          {HEADER_ANCHORS.map((link) => (
            <a key={link.href} href={link.href} onClick={close} className="flex min-h-12 items-center border-b border-hairline/60 text-[1.05rem] text-white">
              {link.label}
            </a>
          ))}
          <Link href="/app/demo" onClick={close} className="flex min-h-12 items-center border-b border-hairline/60 text-[1.05rem] text-white">
            Demo Lab
          </Link>
          {repositoryUrl ? (
            <a href={repositoryUrl} target="_blank" rel="noopener noreferrer" onClick={close} className="flex min-h-12 items-center border-b border-hairline/60 text-[1.05rem] text-white">
              GitHub<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
          <Link href="/app" onClick={close} className="mt-3 inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] bg-mint font-medium text-obsidian">
            Launch App
          </Link>
        </nav>
      </div>
    </div>
  );
}
