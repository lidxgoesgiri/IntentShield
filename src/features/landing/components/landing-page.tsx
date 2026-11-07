import { LandingMotionRoot } from "../motion/landing-motion-root";
import { AtmosphericRain } from "../visuals/atmospheric-rain";
import { BlindSigningProblem } from "./blind-signing-problem";
import { DeveloperEcosystem } from "./developer-ecosystem";
import { FinalCTASection } from "./final-cta-section";
import { HeroSection } from "./hero-section";
import { HowItWorksSection } from "./how-it-works-section";
import { LandingFooter } from "./landing-footer";
import { LandingHeader } from "./landing-header";
import { ProductShowcase } from "./product-showcase";
import { SecurityArchitecture } from "./security-architecture";
import { SimulatorSection } from "./simulator-section";
import { TechnologyMotionRail } from "./technology-motion-rail";

/**
 * Composes the eight numbered chapters (PRD §5, §10.1) plus one unnumbered
 * interlude: hero → problem → simulator → how-it-works → [stack interlude] →
 * product → security → developers → get-started. The footer is navigation.
 */
export function LandingPage() {
  return (
    <>
      <LandingHeader />
      <LandingMotionRoot>
        <AtmosphericRain />
        <main id="main" className="landing-main">
          <HeroSection />
          <BlindSigningProblem />
          <SimulatorSection />
          <HowItWorksSection />
          <TechnologyMotionRail />
          <ProductShowcase />
          <SecurityArchitecture />
          <DeveloperEcosystem />
          <FinalCTASection />
        </main>
        <div className="landing-main">
          <LandingFooter />
        </div>
      </LandingMotionRoot>
    </>
  );
}
