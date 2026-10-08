import type { HtmlTemplate, FormatMode, ThemeId } from "@hanuman/shared-types";
import { generateShortId } from "@/lib/id";

export const MAX_BRAND_PROFILES = 10;
export const MAX_PROFILE_NAME_LENGTH = 100;

export type BrandProfileTab = "overview" | "voiceover" | "creative" | "compliance" | "motion";

export interface BrandSourcing {
  aiGeneratedImages?: boolean;
  imageModel?: string;
  commercialStock: boolean;
  ccPublicDomain: boolean;
  generalWebCrawling: boolean;
}

export type BrandTemplateMode = "auto" | "manual";

export interface BrandBlocklist {
  disableAnimations: boolean;
  disableOverlays: boolean;
  disableEffects: boolean;
  /**
   * auto — orchestrator AI picks from non-blocklisted shipped templates.
   * manual — only explicitly allowed templates may be inserted (allowedTemplates).
   */
  templateMode: BrandTemplateMode;
  blocklistedTemplates: string[];
  /** When templateMode=manual, only these labels/ids may be auto-inserted. */
  allowedTemplates: string[];
  blocklistedTransitions: string[];
}

export interface BrandCompliance {
  sourcing: BrandSourcing;
  blocklist: BrandBlocklist;
  blacklistedWebpages: string[];
}

export interface BrandProfile {
  id: string;
  name: string;
  /** Deterministic hue for avatar gradient when no image is set. */
  avatarHue: number;
  avatarUrl: string | null;
  language: string;
  captionScript?: "latin" | "native";
  motionGraphics?: { enabled: boolean; mode?: "selected" | "auto" | "custom" | "none"; selectedTemplateIds?: string[]; templateId: "press-cutout-v1"; soundEnabled: boolean; intensity: "subtle" | "cinematic" };
  uploadedTemplates?: Array<HtmlTemplate & { previewKey?: string }>;
  voiceId: string;
  themeId: ThemeId;
  backgroundId: string;
  customBackgroundDataUrl: string | null;
  formatMode: FormatMode;
  defaultDurationMin: number;
  compliance: BrandCompliance;
  createdAt: string;
  updatedAt: string;
}

export interface BrandVoice {
  id: string;
  name: string;
  description: string;
  provider: "ElevenLabs" | "SkyClip" | "Sarvam";
  accent: string;
  flag: string;
  gender: "Male" | "Female" | "Neutral";
  age: "Young" | "Middle Aged" | "Elder";
  style: string;
  previewText: string;
  hue: number;
}

export interface BackgroundPreset {
  id: string;
  label: string;
  /** Tailwind-ish gradient / solid class for gallery tiles. */
  swatch: string;
}

export function defaultCompliance(): BrandCompliance {
  return {
    sourcing: {
      commercialStock: true,
      ccPublicDomain: true,
      generalWebCrawling: false,
    },
    blocklist: {
      disableAnimations: false,
      disableOverlays: false,
      disableEffects: false,
      templateMode: "auto",
      blocklistedTemplates: [],
      allowedTemplates: [],
      blocklistedTransitions: [],
    },
    blacklistedWebpages: [],
  };
}

export function createEmptyProfile(name: string): BrandProfile {
  const now = new Date().toISOString();
  const hue = Math.floor(Math.random() * 360);
  return {
    id: generateShortId("bp-"),
    name: name.trim().slice(0, MAX_PROFILE_NAME_LENGTH),
    avatarHue: hue,
    avatarUrl: null,
    language: "en",
    voiceId: "shubh",
    themeId: "standard",
    backgroundId: "bg-waves",
    customBackgroundDataUrl: null,
    formatMode: "documentary",
    defaultDurationMin: 10,
    compliance: defaultCompliance(),
    createdAt: now,
    updatedAt: now,
  };
}
