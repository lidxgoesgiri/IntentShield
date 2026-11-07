import { SIMULATOR_COPY } from "../config/section-copy";
import { InteractiveSimulator } from "./interactive-simulator";
import { SectionHeader } from "./section-header";

/** S03 — Interactive Simulator shell (server) + client island. */
export function SimulatorSection() {
  return (
    <section id="simulator" data-atmosphere="0.22" aria-labelledby="simulator-title" className="border-t border-hairline bg-carbon/30">
      <div className="page-container py-[clamp(64px,11vw,168px)]">
        <SectionHeader index="03" eyebrow="Interactive simulator" title={SIMULATOR_COPY.title} titleId="simulator-title" lead={SIMULATOR_COPY.lead} split="lines" />
        <div className="mt-14 lg:mt-20">
          <InteractiveSimulator />
        </div>
      </div>
    </section>
  );
}
