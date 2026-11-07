import Link from "next/link";
import { BrandMark, BrandWordmark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";
import { externalLinks, HEADER_ANCHORS } from "../config/landing-navigation";
import { MobileNav } from "./mobile-nav";

/** Sticky marketing header: anchors, GitHub (only if configured), Launch App. */
export function LandingHeader() {
  const { repository } = externalLinks();
  return (
    <header className="sticky top-0 z-40 border-b border-hairline/70 bg-obsidian/85 backdrop-blur-md">
      <div className="page-container relative flex h-[72px] items-center gap-4">
        <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-[var(--radius-control)]" aria-label="IntentShield home">
          <BrandMark className="size-8" />
          <BrandWordmark />
        </Link>
        <nav aria-label="Primary" className="ml-8 hidden items-center gap-1 lg:flex">
          {HEADER_ANCHORS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-3 text-[0.925rem] text-silver transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
          {repository ? (
            <a
              href={repository}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-3 text-[0.925rem] text-silver transition-colors hover:text-white"
            >
              GitHub<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/app">Launch App</Link>
          </Button>
          <MobileNav repositoryUrl={repository} />
        </div>
      </div>
    </header>
  );
}
