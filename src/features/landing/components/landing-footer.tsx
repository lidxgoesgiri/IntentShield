import Link from "next/link";
import { BrandMark, BrandWordmark } from "@/components/layout/brand-mark";
import { externalLinks, LANDING_SECTIONS } from "../config/landing-navigation";

/** Footer — navigational/legal element after S08; not counted as a section. */
export function LandingFooter() {
  const { repository } = externalLinks();
  return (
    <footer className="border-t border-hairline">
      <div className="page-container grid gap-10 py-14 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-4">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2.5" aria-label="IntentShield home">
            <BrandMark className="size-7" />
            <BrandWordmark />
          </Link>
          <p className="max-w-sm text-[0.9rem] text-silver">
            Pre-signature intent verification for native SOL transfers on Solana Devnet.
          </p>
        </div>
        <nav aria-label="Footer" className="lg:col-span-3">
          <p className="type-eyebrow mb-3 text-[0.72rem]">Sections</p>
          <ul className="grid grid-cols-2 gap-x-6 lg:grid-cols-1">
            {LANDING_SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="inline-flex min-h-10 items-center text-[0.9rem] text-silver hover:text-white">
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-3 lg:col-span-5">
          <p className="type-eyebrow text-[0.72rem]">Product</p>
          <ul className="space-y-1">
            <li>
              <Link href="/app" className="inline-flex min-h-10 items-center text-[0.9rem] text-silver hover:text-white">
                Workspace (real Devnet)
              </Link>
            </li>
            <li>
              <Link href="/app/demo" className="inline-flex min-h-10 items-center text-[0.9rem] text-silver hover:text-white">
                Demo Lab (controlled samples)
              </Link>
            </li>
            {repository ? (
              <li>
                <a href={repository} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center text-[0.9rem] text-silver hover:text-white">
                  Source on GitHub<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ) : null}
          </ul>
          <p className="text-[0.85rem] leading-relaxed text-muted">
            Limitations: Devnet only · native SOL transfers only · does not evaluate recipient trustworthiness, scams, or other
            programs · AI output is untrusted and never authorizes signing.
          </p>
        </div>
      </div>
      <div className="border-t border-hairline">
        <div className="page-container flex flex-col gap-2 py-6 text-[0.8rem] text-muted sm:flex-row sm:justify-between">
          <p>© 2026 IntentShield. Built for the Solana Hackathon 2026 (MLH).</p>
          <p>Not affiliated with Solana Foundation, MLH, or any wallet provider.</p>
        </div>
      </div>
    </footer>
  );
}
