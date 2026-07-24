"use client";

import { useMemo, useState } from "react";
import { Heart, Play, Search } from "lucide-react";
import { BrandProfileAvatar } from "@/components/brand-profiles/brand-profile-avatar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BRAND_VOICES, useBrandProfileStore, type BrandProfile } from "@/lib/brand-profiles";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type VoiceoverTabProps = {
  profile: BrandProfile;
  onChange: (patch: Partial<BrandProfile>) => void;
};

type Shelf = "explore" | "history" | "favorites";

export function VoiceoverTab({ profile, onChange }: VoiceoverTabProps) {
  const favoriteVoiceIds = useBrandProfileStore((s) => s.favoriteVoiceIds);
  const toggleFavoriteVoice = useBrandProfileStore((s) => s.toggleFavoriteVoice);
  const [shelf, setShelf] = useState<Shelf>("explore");
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [category, setCategory] = useState<"default" | "community">("default");

  const voices = useMemo(() => {
    let list = BRAND_VOICES;
    if (category === "community") {
      list = list.filter((v) => v.provider !== "SkyClip");
    }
    if (provider !== "all") {
      list = list.filter((v) => v.provider === provider);
    }
    if (shelf === "favorites") {
      list = list.filter((v) => favoriteVoiceIds.includes(v.id));
    }
    if (shelf === "history") {
      list = list.filter((v) => v.id === profile.voiceId || favoriteVoiceIds.includes(v.id));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.style.toLowerCase().includes(q) ||
          v.accent.toLowerCase().includes(q),
      );
    }
    return list;
  }, [category, favoriteVoiceIds, profile.voiceId, provider, query, shelf]);

  function previewVoice(name: string, text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      toast.message(`Preview: ${name}`);
      return;
    }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.95;
    window.speechSynthesis.speak(utt);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/8 bg-[#161618] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full bg-white/[0.04] p-1">
          {(
            [
              ["explore", "Explore"],
              ["history", "History"],
              ["favorites", "Favorites"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setShelf(id)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition",
                shelf === id
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search voices"
            className="h-9 rounded-full border-white/10 bg-white/[0.04] pl-9 text-sm text-white placeholder:text-zinc-500"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={provider} onValueChange={(v) => v && setProvider(v)}>
          <SelectTrigger className="h-9 w-44 rounded-lg border-white/10 bg-white/[0.04] text-sm text-white">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent className="z-[130] border-white/10 bg-[#1a1a1c] text-white">
            <SelectItem value="all">All providers</SelectItem>
            <SelectItem value="ElevenLabs">ElevenLabs</SelectItem>
            <SelectItem value="Sarvam">Sarvam</SelectItem>
            <SelectItem value="SkyClip">SkyClip</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-4 text-sm">
          {(
            [
              ["default", "Default"],
              ["community", "Community"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setCategory(id)}
              className={cn(
                "border-b-2 pb-1 transition",
                category === id
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-zinc-400 hover:text-zinc-200",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-white/6 overflow-hidden rounded-xl border border-white/8">
        {voices.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-500">No voices match your filters.</p>
        ) : (
          voices.map((v) => {
            const selected = profile.voiceId === v.id;
            const fav = favoriteVoiceIds.includes(v.id);
            return (
              <div
                key={v.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 transition hover:bg-white/[0.03]",
                  selected && "bg-blue-500/8",
                )}
              >
                <button
                  type="button"
                  onClick={() => onChange({ voiceId: v.id })}
                  className={cn(
                    "size-4 shrink-0 rounded-full border-2 transition",
                    selected ? "border-blue-500 bg-blue-500" : "border-zinc-600",
                  )}
                  aria-label={`Select ${v.name}`}
                />
                <BrandProfileAvatar name={v.name} hue={v.hue} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{v.name}</p>
                  <p className="truncate text-xs text-zinc-500">{v.description}</p>
                </div>
                <span className="hidden rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-zinc-900 sm:inline">
                  {v.provider}
                </span>
                <span className="hidden items-center gap-1 text-xs text-zinc-400 md:inline-flex">
                  <span>{v.flag}</span>
                  {v.accent}
                </span>
                <span className="hidden rounded-full bg-white/6 px-2 py-0.5 text-[10px] text-zinc-400 lg:inline">
                  {v.gender}
                </span>
                <span className="hidden rounded-full bg-white/6 px-2 py-0.5 text-[10px] text-zinc-400 lg:inline">
                  {v.age}
                </span>
                <span className="hidden rounded-full bg-white/6 px-2 py-0.5 text-[10px] text-zinc-400 xl:inline">
                  {v.style}
                </span>
                <button
                  type="button"
                  onClick={() => toggleFavoriteVoice(v.id)}
                  className="rounded-md p-1.5 text-zinc-500 hover:bg-white/5 hover:text-rose-400"
                  aria-label={fav ? "Unfavorite" : "Favorite"}
                >
                  <Heart className={cn("size-3.5", fav && "fill-rose-400 text-rose-400")} />
                </button>
                <button
                  type="button"
                  onClick={() => previewVoice(v.name, v.previewText)}
                  className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"
                  aria-label={`Preview ${v.name}`}
                >
                  <Play className="size-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
