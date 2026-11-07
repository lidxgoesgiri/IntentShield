import { ArrowDown } from "lucide-react";
import { AddressDiff } from "@/components/ui/address-diff";
import { PROBLEM_COPY } from "../config/section-copy";
import { DEMO_PARTIES } from "../simulator/demo-fixtures.generated";
import { SectionHeader } from "./section-header";

/** S02 — Blind Signing Problem (PRD §10.1). Illustrative, never submitted. */
export function BlindSigningProblem() {
  return (
    <section id="problem" data-atmosphere="0.55" aria-labelledby="problem-title" className="border-t border-hairline">
      <div className="page-container py-[clamp(64px,11vw,168px)]">
        <SectionHeader index="02" eyebrow="The blind-signing problem" title={PROBLEM_COPY.title} titleId="problem-title" lead={PROBLEM_COPY.lead} split="words" />

        <div className="mt-16 grid border-y border-hairline lg:mt-24 lg:grid-cols-2">
          <div className="space-y-4 border-b border-hairline py-8 lg:border-b-0 lg:border-r lg:pr-12" data-reveal="slide">
            <h3 className="type-eyebrow">What you intended</h3>
            <p className="font-heading text-[clamp(1.5rem,2.6vw,2.4rem)] leading-tight text-white">
              Send <span className="text-mint">0.1 SOL</span> to the friend whose address you copied.
            </p>
            <p className="text-silver">One transfer. One recipient. One amount you can read.</p>
          </div>
          <div className="space-y-4 py-8 lg:pl-12" data-reveal="stagger">
            <h3 className="type-eyebrow">What a transaction can contain</h3>
            <ul className="space-y-3 text-silver">
              <li className="flex gap-3">
                <span aria-hidden className="mt-2.5 h-px w-4 shrink-0 bg-warning" />A different amount than the one you typed.
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-2.5 h-px w-4 shrink-0 bg-warning" />A recipient that only looks like yours.
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-2.5 h-px w-4 shrink-0 bg-warning" />Extra instructions you never asked for.
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 space-y-3">
          <p className="type-eyebrow text-[0.72rem]">Illustrative examples / not submitted</p>
          <ol className="divide-y divide-hairline border-y border-hairline">
            <li className="grid gap-6 py-8 md:grid-cols-12" data-reveal="clip">
              <p className="font-mono text-[0.8rem] uppercase tracking-[0.1em] text-muted md:col-span-2">Case A · amount</p>
              <div className="md:col-span-4">
                <p className="type-caption">You approved</p>
                <p className="font-data text-[clamp(1.6rem,3vw,2.6rem)] text-white">0.1 SOL</p>
              </div>
              <div className="md:col-span-4">
                <p className="type-caption">The transaction moves</p>
                <p className="font-data text-[clamp(1.6rem,3vw,2.6rem)] text-warning">
                  0.8 SOL <span className="sr-only">(changed)</span>
                </p>
              </div>
              <p className="text-[0.925rem] text-silver md:col-span-2">Eight times what you meant — one digit.</p>
            </li>
            <li className="grid gap-6 py-8 md:grid-cols-12" data-reveal="clip">
              <p className="font-mono text-[0.8rem] uppercase tracking-[0.1em] text-muted md:col-span-2">Case B · recipient</p>
              <div className="space-y-4 md:col-span-8">
                <div>
                  <p className="type-caption">You copied</p>
                  <p className="font-data break-all text-[clamp(0.95rem,1.5vw,1.2rem)] text-white">{DEMO_PARTIES.recipient}</p>
                </div>
                <div>
                  <p className="type-caption">The transaction pays</p>
                  <AddressDiff
                    expected={DEMO_PARTIES.recipient}
                    actual={DEMO_PARTIES.lookalikeRecipient}
                    className="text-[clamp(0.95rem,1.5vw,1.2rem)] text-white"
                  />
                </div>
              </div>
              <p className="text-[0.925rem] text-silver md:col-span-2">
                Same first and last characters. A truncated preview would look identical.
              </p>
            </li>
          </ol>
        </div>

        <div className="mt-12 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-[0.95rem] text-silver">{PROBLEM_COPY.caveat}</p>
          <a href="#simulator" className="inline-flex min-h-11 items-center gap-2 text-white underline decoration-mint/60 underline-offset-[6px] hover:decoration-mint">
            See a mismatch <ArrowDown className="size-4" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
