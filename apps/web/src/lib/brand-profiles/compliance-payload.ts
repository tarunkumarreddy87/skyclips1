import type { BrandProfile } from "./types";

export type BrandComplianceGeneratePayload = {
  uploadedTemplates?: BrandProfile["uploadedTemplates"];
  motionGraphics?: BrandProfile["motionGraphics"];
  profileId?: string;
  themeId?: string;
  voiceId?: string;
  language?: string;
  captionScript?: "latin" | "native";
  aiGeneratedImages?: boolean;
  imageModel?: string;
  disableOverlays: boolean;
  disableAnimations: boolean;
  disableEffects: boolean;
  blocklistedTransitions: string[];
  templateMode: "auto" | "manual";
  blocklistedTemplates: string[];
  allowedTemplates: string[];
  backgroundId?: string;
  backgroundColor?: string;
  commercialStock: boolean;
  ccPublicDomain: boolean;
  generalWebCrawling: boolean;
  blacklistedWebpages: string[];
};

/** Payload shape for POST /generate brandCompliance (worker-enforced). */
export function brandComplianceForGenerate(
  profile: BrandProfile | null | undefined,
): BrandComplianceGeneratePayload | undefined {
  if (!profile) return undefined;
  const sourcing = profile.compliance.sourcing;
  return {
    profileId: profile.id,
    motionGraphics: profile.motionGraphics,
    uploadedTemplates: profile.uploadedTemplates,
    themeId: "standard",
    voiceId: profile.voiceId,
    language: profile.language,
    captionScript: profile.captionScript ?? "latin",
    aiGeneratedImages: sourcing.aiGeneratedImages ?? false,
    imageModel: sourcing.imageModel,
    disableOverlays: false,
    disableAnimations: false,
    disableEffects: false,
    blocklistedTransitions: [],
    templateMode: "manual",
    blocklistedTemplates: [],
    allowedTemplates: [],
    commercialStock: sourcing.commercialStock,
    ccPublicDomain: false,
    generalWebCrawling: sourcing.generalWebCrawling,
    blacklistedWebpages: profile.compliance.blacklistedWebpages ?? [],
  };
}
