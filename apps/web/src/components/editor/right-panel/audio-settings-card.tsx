"use client";

import type { AudioItem } from "@/lib/editor/types";
import { useEditorStore } from "@/lib/editor/store";
import { sliderValue } from "@/lib/editor/slider-utils";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

export function AudioSettingsCard({ item }: { item: AudioItem }) {
  const updateAudioVolume = useEditorStore((s) => s.updateAudioVolume);
  const updateAudioFades = useEditorStore((s) => s.updateAudioFades);

  const clipMs = Math.max(1, item.endMs - item.startMs);
  const maxFade = Math.min(10_000, Math.floor(clipMs / 2));

  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-3">
      <p className="text-xs font-medium text-zinc-400">Audio clip</p>
      <p className="text-[10px] text-zinc-600">{item.label}</p>
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-zinc-500">
          <Label>Volume</Label>
          <span>{item.volume}%</span>
        </div>
        <Slider value={[item.volume]} max={100} onValueChange={(v) => updateAudioVolume(item.id, sliderValue(v))} />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-zinc-500">
          <Label>Fade in</Label>
          <span>{((item.fadeIn ?? 0) / 1000).toFixed(1)}s</span>
        </div>
        <Slider
          value={[Math.min(item.fadeIn ?? 0, maxFade)]}
          max={maxFade}
          step={50}
          onValueChange={(v) =>
            updateAudioFades(item.id, sliderValue(v), item.fadeOut ?? 0)
          }
        />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-zinc-500">
          <Label>Fade out</Label>
          <span>{((item.fadeOut ?? 0) / 1000).toFixed(1)}s</span>
        </div>
        <Slider
          value={[Math.min(item.fadeOut ?? 0, maxFade)]}
          max={maxFade}
          step={50}
          onValueChange={(v) =>
            updateAudioFades(item.id, item.fadeIn ?? 0, sliderValue(v))
          }
        />
      </div>
    </div>
  );
}
