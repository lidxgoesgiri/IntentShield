import { ArrowUpRight, FileCode } from "lucide-react";
import Link from "next/link";
import { DEVELOPER_COPY } from "../config/section-copy";
import { externalLinks } from "../config/landing-navigation";
import { SectionHeader } from "./section-header";

const SNIPPET = `const result = verifyNativeSolTransfer({
  intent,              // values you approved
  messageBytes,        // exact bytes to sign
  context,             // Devnet, by genesis hash
  expectedFingerprint, // what you reviewed
});

if (!result.ok) {
  // blocked → wallet is never asked
}`;

/** S07 — Developer & Ecosystem: real stack, real links only (PRD §10.1). */
export function DeveloperEcosystem() {
  const links = externalLinks();
  return (
    <section id="developers" data-atmosphere="0.3" aria-labelledby="developers-title" className="border-t border-hairline">
      <div className="page-container section-space">
        <SectionHeader index="07" eyebrow={DEVELOPER_COPY.eyebrowTitle} title={DEVELOPER_COPY.title} titleId="developers-title" split="words" />

        <div className="mt-10 grid gap-8 lg:mt-14 lg:grid-cols-12">
          <dl className="grid min-w-0 gap-px self-start overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-hairline sm:grid-cols-2 lg:col-span-7" data-reveal="clip">
            {DEVELOPER_COPY.stack.map((item) => (
              <div key={item.name} className="space-y-1.5 bg-obsidian p-6">
                <dt className="font-heading text-[1.05rem] font-semibold text-white">{item.name}</dt>
                <dd className="text-[0.925rem] text-silver">{item.detail}</dd>
              </div>
            ))}
          </dl>

          <div className="min-w-0 space-y-6 lg:col-span-5" data-reveal="slide">
            <figure className="overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-carbon">
              <figcaption className="flex items-center gap-2 border-b border-hairline px-4 py-2.5 font-mono text-[0.8125rem] text-muted">
                <FileCode className="size-4" aria-hidden /> src/features/verification/lib/verify-native-sol-transfer.ts
              </figcaption>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words p-4 font-mono text-[0.8125rem] leading-relaxed text-silver sm:whitespace-pre">
                <code>{SNIPPET}</code>
              </pre>
            </figure>

            <ul className="space-y-3">
              {links.repository ? (
                <li>
                  <a href={links.repository} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-white underline decoration-mint/60 underline-offset-[6px] hover:decoration-mint">
                    View Source <ArrowUpRight className="size-4" aria-hidden />
                    <span className="sr-only">(opens GitHub in a new tab)</span>
                  </a>
                </li>
              ) : null}
              <li>
                {links.docs ? (
                  <a href={links.docs} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-white underline decoration-mint/60 underline-offset-[6px] hover:decoration-mint">
                    Explore Technical Docs <ArrowUpRight className="size-4" aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : (
                  <p className="text-[0.925rem] text-muted">Native SOL · Devnet only · inspectable verification.</p>
                )}
              </li>
              <li>
                <Link href="/app/demo" className="inline-flex min-h-11 items-center gap-2 text-silver underline decoration-hairline underline-offset-[6px] hover:text-white">
                  Open the Demo Lab
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
