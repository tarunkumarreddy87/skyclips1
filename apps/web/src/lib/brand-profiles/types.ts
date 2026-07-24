import type { FormatMode, ThemeId } from "@hanuman/shared-types";
import { generateShortId } from "@/lib/id";

export const MAX_BRAND_PROFILES = 10;
export const MAX_PROFILE_NAME_LENGTH = 100;

export type BrandProfileTab = "overview" | "voiceover" | "creative" | "compliance";

export interface BrandSourcing {
  commercialStock: boolean;
  ccPublicDomain: boolean;
  generalWebCrawling: boolean;
}

export interface BrandBlocklist {
  disableAnimations: boolean;
  disableOverlays: boolean;
  disableEffects: boolean;
  blocklistedTemplates: string[];
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
      blocklistedTemplates: [],
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
