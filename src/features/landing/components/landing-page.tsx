import { LandingMotionRoot } from "../motion/landing-motion-root";
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

/**
 * Composes exactly eight sections in order (PRD §5, §10.1):
 * hero → problem → simulator → how-it-works → product → security → developers → get-started.
 * The footer is a navigational element, not a section.
 */
export function LandingPage() {
  return (
    <>
      <LandingHeader />
      <LandingMotionRoot>
        <main id="main">
          <HeroSection />
          <BlindSigningProblem />
          <SimulatorSection />
          <HowItWorksSection />
          <ProductShowcase />
          <SecurityArchitecture />
          <DeveloperEcosystem />
          <FinalCTASection />
        </main>
        <LandingFooter />
      </LandingMotionRoot>
    </>
  );
}
