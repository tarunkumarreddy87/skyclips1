"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createEmptyProfile,
  MAX_BRAND_PROFILES,
  MAX_PROFILE_NAME_LENGTH,
  type BrandProfile,
} from "./types";

interface BrandProfileState {
  profiles: BrandProfile[];
  activeProfileId: string | null;
  favoriteVoiceIds: string[];
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  getActiveProfile: () => BrandProfile | null;
  setActiveProfileId: (id: string) => void;
  createProfile: (name: string) => BrandProfile;
  updateProfile: (id: string, patch: Partial<BrandProfile>) => BrandProfile | null;
  deleteProfile: (id: string) => void;
  toggleFavoriteVoice: (voiceId: string) => void;
  validateName: (name: string, excludeId?: string) => string | null;
}

function seedProfiles(): BrandProfile[] {
  const now = new Date().toISOString();
  const compliance = {
    sourcing: {
      commercialStock: true,
      ccPublicDomain: true,
      generalWebCrawling: false,
    },
    blocklist: {
      disableAnimations: false,
      disableOverlays: false,
      disableEffects: false,
      blocklistedTemplates: [] as string[],
      blocklistedTransitions: [] as string[],
    },
    blacklistedWebpages: [] as string[],
  };
  return [
    {
      id: "bp-amish",
      name: "AMISH GUY",
      avatarHue: 320,
      avatarUrl: null,
      language: "en",
      voiceId: "shubh",
      themeId: "history",
      backgroundId: "bg-paper",
      customBackgroundDataUrl: null,
      formatMode: "documentary",
      defaultDurationMin: 10,
      compliance,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "bp-forgotten",
      name: "Forgotten Roots",
      avatarHue: 210,
      avatarUrl: null,
      language: "en",
      voiceId: "aditya",
      themeId: "crime",
      backgroundId: "bg-waves",
      customBackgroundDataUrl: null,
      formatMode: "documentary",
      defaultDurationMin: 10,
      compliance: structuredClone(compliance),
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export const useBrandProfileStore = create<BrandProfileState>()(
  persist(
    (set, get) => ({
      profiles: seedProfiles(),
      activeProfileId: "bp-amish",
      favoriteVoiceIds: [],
      hydrated: false,

      setHydrated: (v) => set({ hydrated: v }),

      getActiveProfile: () => {
        const { profiles, activeProfileId } = get();
        return profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;
      },

      setActiveProfileId: (id) => {
        const exists = get().profiles.some((p) => p.id === id);
        if (exists) set({ activeProfileId: id });
      },

      validateName: (name, excludeId) => {
        const trimmed = name.trim();
        if (!trimmed) return "Enter a profile name.";
        if (trimmed.length > MAX_PROFILE_NAME_LENGTH) {
          return `Name must be at most ${MAX_PROFILE_NAME_LENGTH} characters.`;
        }
        const clash = get().profiles.some(
          (p) => p.id !== excludeId && p.name.toLowerCase() === trimmed.toLowerCase(),
        );
        if (clash) return "Profile names must be unique in this workspace.";
        return null;
      },

      createProfile: (name) => {
        const err = get().validateName(name);
        if (err) throw new Error(err);

        let profiles = [...get().profiles];
        // Cap at 10 — drop oldest when creating an 11th (VidRush docs).
        while (profiles.length >= MAX_BRAND_PROFILES) {
          profiles = profiles
            .slice()
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .slice(1);
        }

        const profile = createEmptyProfile(name);
        profiles = [...profiles, profile];
        set({ profiles, activeProfileId: profile.id });
        return profile;
      },

      updateProfile: (id, patch) => {
        if (patch.name !== undefined) {
          const err = get().validateName(patch.name, id);
          if (err) throw new Error(err);
        }
        let updated: BrandProfile | null = null;
        const profiles = get().profiles.map((p) => {
          if (p.id !== id) return p;
          updated = {
            ...p,
            ...patch,
            name: patch.name !== undefined ? patch.name.trim() : p.name,
            updatedAt: new Date().toISOString(),
          };
          return updated;
        });
        if (updated) set({ profiles });
        return updated;
      },

      deleteProfile: (id) => {
        const profiles = get().profiles.filter((p) => p.id !== id);
        const activeProfileId =
          get().activeProfileId === id ? (profiles[0]?.id ?? null) : get().activeProfileId;
        set({ profiles, activeProfileId });
      },

      toggleFavoriteVoice: (voiceId) => {
        const favs = get().favoriteVoiceIds;
        set({
          favoriteVoiceIds: favs.includes(voiceId)
            ? favs.filter((id) => id !== voiceId)
            : [...favs, voiceId],
        });
      },
    }),
    {
      name: "hanuman-brand-profiles",
      version: 2,
      migrate: (persisted) => {
        const state = persisted as {
          profiles?: BrandProfile[];
          activeProfileId?: string | null;
          favoriteVoiceIds?: string[];
        };
        const seeds = seedProfiles();
        const existing = state.profiles ?? [];
        const byId = new Map(existing.map((p) => [p.id, p]));
        for (const seed of seeds) {
          if (!byId.has(seed.id)) byId.set(seed.id, seed);
        }
        return {
          profiles: Array.from(byId.values()),
          activeProfileId: state.activeProfileId ?? "bp-amish",
          favoriteVoiceIds: state.favoriteVoiceIds ?? [],
        };
      },
      partialize: (s) => ({
        profiles: s.profiles,
        activeProfileId: s.activeProfileId,
        favoriteVoiceIds: s.favoriteVoiceIds,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
