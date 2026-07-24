import type { BrandProfile } from "./types";

/** Payload shape for POST /generate brandCompliance (worker-enforced). */
export function brandComplianceForGenerate(profile: BrandProfile | null | undefined) {
  if (!profile) return undefined;
  return {
    disableOverlays: profile.compliance.blocklist.disableOverlays,
    disableAnimations: profile.compliance.blocklist.disableAnimations,
    blocklistedTransitions: profile.compliance.blocklist.blocklistedTransitions,
  };
}
