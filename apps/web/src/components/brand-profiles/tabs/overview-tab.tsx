"use client";

import type { BrandProfile } from "@/lib/brand-profiles";
import { DURATION_OPTIONS, VIDEO_LANGUAGES } from "@/lib/brand-profiles";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OverviewTabProps = {
  profile: BrandProfile;
  onChange: (patch: Partial<BrandProfile>) => void;
};

export function OverviewTab({ profile, onChange }: OverviewTabProps) {
  const lang = VIDEO_LANGUAGES.find((l) => l.id === profile.language) ?? VIDEO_LANGUAGES[0];

  return (
    <div className="rounded-2xl border border-white/8 bg-[#161618] p-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-zinc-400">Brand profile&apos;s name</Label>
          <Input
            value={profile.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="h-11 rounded-xl border-white/10 bg-white/[0.04] text-white focus-visible:border-blue-500 focus-visible:ring-blue-500/25"
          />
          <p className="text-[11px] text-zinc-500">
            For your reference only — it won&apos;t appear in videos.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-zinc-400">Video language</Label>
          <Select
            value={profile.language}
            onValueChange={(v) => v && onChange({ language: v })}
          >
            <SelectTrigger className="h-11 w-full rounded-xl border-white/10 bg-white/[0.04] text-white focus:ring-blue-500/25 data-[state=open]:border-blue-500">
              <SelectValue placeholder={`${lang.flag} ${lang.label}`} />
            </SelectTrigger>
            <SelectContent className="z-[130] border-white/10 bg-[#1a1a1c] text-white">
              {VIDEO_LANGUAGES.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.flag} {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-zinc-400">Default length</Label>
          <Select
            value={String(profile.defaultDurationMin)}
            onValueChange={(v) => v && onChange({ defaultDurationMin: Number(v) })}
          >
            <SelectTrigger className="h-11 w-full rounded-xl border-white/10 bg-white/[0.04] text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[130] border-white/10 bg-[#1a1a1c] text-white">
              {DURATION_OPTIONS.map((d) => (
                <SelectItem key={d.minutes} value={String(d.minutes)}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-zinc-400">Format mode</Label>
          <Select
            value={profile.formatMode}
            onValueChange={(v) =>
              v && onChange({ formatMode: v as BrandProfile["formatMode"] })
            }
          >
            <SelectTrigger className="h-11 w-full rounded-xl border-white/10 bg-white/[0.04] text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[130] border-white/10 bg-[#1a1a1c] text-white">
              <SelectItem value="documentary">Documentary</SelectItem>
              <SelectItem value="listicle">Listicle</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
