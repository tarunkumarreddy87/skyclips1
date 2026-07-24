"use client";

import { useEffect, useState } from "react";
import { PromptHero } from "@/components/home/prompt-hero";
import { RecentGenerations } from "@/components/home/recent-generations";
import { StudioTopBar } from "@/components/studio-top-bar";

export function HomeStudio() {
  const [seedPrompt, setSeedPrompt] = useState<string | undefined>();

  useEffect(() => {
    try {
      const seeded =
        sessionStorage.getItem("skyclip_seed_prompt") ??
        sessionStorage.getItem("hanuman_seed_prompt");
      if (seeded) {
        sessionStorage.removeItem("skyclip_seed_prompt");
        sessionStorage.removeItem("hanuman_seed_prompt");
        setSeedPrompt(seeded);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="relative flex min-h-svh w-full flex-col bg-[#1a1a1a] text-white">
      <StudioTopBar />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-16 pt-14 md:px-6 md:pt-16">
        <div className="flex flex-1 flex-col justify-center py-8 md:min-h-[46vh] md:py-12">
          <PromptHero
            seedPrompt={seedPrompt}
            onSeedConsumed={() => setSeedPrompt(undefined)}
          />
        </div>
        <RecentGenerations />
      </div>
    </div>
  );
}
