import { ArrowDown, Bot } from "lucide-react";
import { HOW_COPY } from "../config/section-copy";
import { EnergyRibbon } from "../visuals/energy-ribbon";
import { SectionHeader } from "./section-header";

/** S04 — Same sequence as the real pipeline: validation → simulation → optional explanation. */
export function HowItWorksSection() {
  return (
    <section id="how-it-works" data-atmosphere="0.5" aria-labelledby="how-title" className="border-t border-hairline" data-how-section="">
      <div className="page-container section-space">
        <SectionHeader index="04" eyebrow="How it works" title={HOW_COPY.title} titleId="how-title" lead={HOW_COPY.lead} split="chars" />

        <div className="how-stage relative mt-10 lg:mt-14 lg:py-6" data-how-pin="">
          <EnergyRibbon />
          <ol className="relative space-y-10 pl-16 lg:mt-6 lg:grid lg:grid-cols-3 lg:gap-10 lg:space-y-0 lg:pl-0">
            {HOW_COPY.steps.map((step) => (
              <li key={step.id} className="how-step space-y-3 lg:text-center" data-how-step={step.id} data-active="true">
                <p className="font-mono text-[0.8125rem] tracking-[0.12em] text-mint">{step.index}</p>
                <h3 className="type-h3">{step.title}</h3>
                <p className="mx-auto max-w-[36ch] text-silver">{step.body}</p>
                <p className="mx-auto max-w-[36ch] text-[0.875rem] text-muted">{step.limit}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-10 grid gap-4 border-y border-hairline py-6 lg:grid-cols-12" data-reveal="clip">
          <p className="type-eyebrow lg:col-span-3">Before your wallet opens</p>
          <div className="space-y-3 lg:col-span-9">
            <p className="font-data text-[0.9rem] leading-relaxed text-white">
              approve intent → build + verify the exact message → simulate on Devnet → review → sign in your wallet
            </p>
            <p className="text-[0.925rem] text-silver">
              AI can draft earlier and explain later. It never authorizes a signature.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex max-w-xl items-start gap-3 text-silver">
            <Bot className="mt-1 size-5 shrink-0 text-muted" aria-hidden />
            <span>
              <strong className="font-medium text-white">AI never authorizes signing.</strong> It can draft and explain; the
              verdict comes from the rule engine, and only your wallet can sign.
            </span>
          </p>
          <a href="#security" className="inline-flex min-h-11 items-center gap-2 text-white underline decoration-mint/60 underline-offset-[6px] hover:decoration-mint">
            Understand security limits <ArrowDown className="size-4" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
