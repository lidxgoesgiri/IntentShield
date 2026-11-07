"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/app", label: "Workspace" },
  { href: "/app/demo", label: "Demo Lab" },
] as const;

export function ProductNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Product" className={cn("flex items-center gap-1", className)}>
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-3 text-[0.925rem] transition-colors",
              active ? "bg-raised text-white" : "text-silver hover:text-white",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
