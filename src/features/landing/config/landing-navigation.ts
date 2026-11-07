import { publicConfig } from "@/config/env";
import { HISTORICAL_DEVNET_PROOF } from "@/config/proof";

export { HEADER_ANCHORS, LANDING_SECTIONS, type LandingSectionId } from "./landing-sections";

/**
 * External links render only when a real, configured URL exists. Used by
 * server components only (keeps env parsing out of client bundles).
 */
export function externalLinks() {
  return {
    repository: publicConfig.repositoryUrl ?? null,
    docs: publicConfig.docsUrl ?? (publicConfig.repositoryUrl ? `${publicConfig.repositoryUrl}#readme` : null),
    proofSignature: publicConfig.proofSignature ?? HISTORICAL_DEVNET_PROOF.signature,
  };
}
