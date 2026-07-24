"use client";

import { useRef } from "react";
import { motion } from "motion/react";
import { ImageIcon, Palette, Upload } from "lucide-react";
import { BACKGROUND_PRESETS, THEME_CARDS, type BrandProfile } from "@/lib/brand-profiles";
import { BlocklistingSection } from "@/components/brand-profiles/tabs/blocklisting-section";
import { cn } from "@/lib/utils";
import type { ThemeId } from "@hanuman/shared-types";

type CreativeAssetsTabProps = {
  profile: BrandProfile;
  onChange: (patch: Partial<BrandProfile>) => void;
};

export function CreativeAssetsTab({ profile, onChange }: CreativeAssetsTabProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedBg =
    BACKGROUND_PRESETS.find((b) => b.id === profile.backgroundId) ?? BACKGROUND_PRESETS[0];

  function handleUpload(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange({
        customBackgroundDataUrl: typeof reader.result === "string" ? reader.result : null,
        backgroundId: "bg-custom",
      });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="rounded-2xl border border-white/8 bg-[#161618] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      >
        <div className="mb-4 flex items-start gap-2.5">
          <span className="mt-0.5 flex size-8 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
            <ImageIcon className="size-4 text-zinc-300" />
          </span>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-white">Background image</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Choose a background image from defaults or upload your own.
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <div className="grid grid-cols-3 gap-2">
            {BACKGROUND_PRESETS.map((bg) => {
              const active = profile.backgroundId === bg.id && !profile.customBackgroundDataUrl;
              return (
                <button
                  key={bg.id}
                  type="button"
                  title={bg.label}
                  onClick={() =>
                    onChange({ backgroundId: bg.id, customBackgroundDataUrl: null })
                  }
                  className={cn(
                    "aspect-video overflow-hidden rounded-xl ring-2 transition duration-200 hover:-translate-y-0.5",
                    bg.swatch,
                    active
                      ? "ring-blue-500 shadow-[0_0_24px_-8px_rgba(59,130,246,0.7)]"
                      : "ring-transparent hover:ring-white/25",
                  )}
                />
              );
            })}
          </div>

          <div className="flex min-h-[200px] flex-col rounded-xl border border-dashed border-white/15 bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-white">Selected image</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700"
              >
                <Upload className="size-3.5" />
                Upload image
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-lg">
              {profile.customBackgroundDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.customBackgroundDataUrl}
                  alt="Custom background"
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <div className={cn("absolute inset-0", selectedBg.swatch)} />
              )}
              {!profile.customBackgroundDataUrl ? (
                <p className="relative z-10 max-w-[240px] px-4 text-center text-xs text-zinc-300/90 drop-shadow">
                  Choose a background from the gallery, or upload your own.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
        className="rounded-2xl border border-white/8 bg-[#161618] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      >
        <div className="mb-4 flex items-start gap-2.5">
          <span className="mt-0.5 flex size-8 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
            <Palette className="size-4 text-zinc-300" />
          </span>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-white">Theme Selection</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Choose the styling for motion graphic templates used in generated videos.
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-2">
            {THEME_CARDS.map((theme) => {
              const active = profile.themeId === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => onChange({ themeId: theme.id as ThemeId })}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition duration-200",
                    active
                      ? "border-blue-500/60 bg-blue-500/10 shadow-[0_0_24px_-12px_rgba(59,130,246,0.55)]"
                      : "border-white/8 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-14 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold",
                      theme.thumb,
                    )}
                  >
                    Aa
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{theme.name}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{theme.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-dashed border-white/15 bg-black/25 p-4">
            <p className="mb-3 text-sm font-medium text-white">Preview</p>
            <ThemePreview themeId={profile.themeId} />
          </div>
        </div>
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
      >
        <BlocklistingSection profile={profile} onChange={onChange} />
      </motion.div>
    </div>
  );
}

function ThemePreview({ themeId }: { themeId: ThemeId }) {
  const styles: Record<
    ThemeId,
    { box: string; title: string; accent: string; caption: string }
  > = {
    crime: {
      box: "bg-zinc-950",
      title: "text-red-300",
      accent: "bg-red-600",
      caption: "True crime · investigative",
    },
    history: {
      box: "bg-amber-50",
      title: "text-amber-950",
      accent: "bg-amber-700",
      caption: "Documentary · archival",
    },
    modern: {
      box: "bg-zinc-200",
      title: "text-zinc-900",
      accent: "bg-rose-500",
      caption: "Tech · lifestyle",
    },
    minimalist: {
      box: "bg-white",
      title: "text-zinc-800",
      accent: "bg-zinc-900",
      caption: "Clean · corporate",
    },
    standard: {
      box: "bg-zinc-800",
      title: "text-white",
      accent: "bg-blue-500",
      caption: "Balanced · general",
    },
  };
  const s = styles[themeId];
  return (
    <div
      className={cn(
        "flex aspect-video flex-col justify-between overflow-hidden rounded-lg p-4 transition-colors",
        s.box,
      )}
    >
      <div>
        <span
          className={cn(
            "inline-block rounded px-2 py-0.5 text-[10px] font-semibold text-white",
            s.accent,
          )}
        >
          CHAPTER 01
        </span>
        <p className={cn("mt-3 text-lg font-bold leading-tight", s.title)}>
          Motion templates preview
        </p>
      </div>
      <p className={cn("text-xs opacity-70", s.title)}>{s.caption}</p>
    </div>
  );
}
