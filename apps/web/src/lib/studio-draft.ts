"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ModelId } from "@/lib/mock-data";

type Draft = { prompt: string; title: string; model: ModelId; durationOverride: number | null; scriptFile: File | null };
const empty: Draft = { prompt: "", title: "", model: "skyclip-v1", durationOverride: null, scriptFile: null };
export const useStudioDraft = create<Draft & { patch: (value: Partial<Draft>) => void; clear: () => void }>()(persist(
  set => ({ ...empty, patch: value => set(value), clear: () => set(empty) }),
  { name: "skyclip-studio-draft", skipHydration: true, storage: createJSONStorage(() => sessionStorage),
    // File objects stay in memory across client navigation; never serialize their contents.
    partialize: ({ prompt, title, model, durationOverride }) => ({ prompt, title, model, durationOverride }) },
));
