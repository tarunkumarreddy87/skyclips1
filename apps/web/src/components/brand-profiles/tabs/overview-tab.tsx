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
    <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="channel-name" className="text-xs text-muted-foreground">Channel profile name</Label>
          <Input
            id="channel-name"
            value={profile.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="h-11 rounded-xl border-input bg-background text-foreground focus-visible:ring-ring/25"
          />
          <p className="text-[11px] text-muted-foreground">
            For your reference only — it won&apos;t appear in videos.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Video language</Label>
          <Select
            value={profile.language}
            onValueChange={(v) => v && onChange({ language: v })}
          >
            <SelectTrigger className="h-11 w-full rounded-xl border-input bg-background text-foreground focus:ring-ring/25">
              <SelectValue>{lang.flag} {lang.label}</SelectValue>
            </SelectTrigger>
            <SelectContent className="border-border bg-popover text-popover-foreground">
              {VIDEO_LANGUAGES.map((l) => (
                <SelectItem key={l.id} value={l.id} disabled={["as", "ur", "sa", "es", "fr", "de", "pt", "ja"].includes(l.id)}>
                  {l.flag} {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Narration uses this language. Captions keep the same words in English letters.</p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Default length</Label>
          <Select
            value={String(profile.defaultDurationMin)}
            onValueChange={(v) => v && onChange({ defaultDurationMin: Number(v) })}
          >
            <SelectTrigger className="h-11 w-full rounded-xl border-input bg-background text-foreground">
              <SelectValue>{profile.defaultDurationMin} minutes</SelectValue>
            </SelectTrigger>
            <SelectContent className="border-border bg-popover text-popover-foreground">
              {DURATION_OPTIONS.map((d) => (
                <SelectItem key={d.minutes} value={String(d.minutes)}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Format mode</Label>
          <Select
            value={profile.formatMode}
            onValueChange={(v) =>
              v && onChange({ formatMode: v as BrandProfile["formatMode"] })
            }
          >
            <SelectTrigger className="h-11 w-full rounded-xl border-input bg-background text-foreground">
              <SelectValue>{profile.formatMode === "documentary" ? "Documentary" : "Listicle"}</SelectValue>
            </SelectTrigger>
            <SelectContent className="border-border bg-popover text-popover-foreground">
              <SelectItem value="documentary">Documentary</SelectItem>
              <SelectItem value="listicle">Listicle</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
