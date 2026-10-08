"use client";

import { useEditorStore } from "@/lib/editor/store";
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/editor/utils";
import { sliderValue } from "@/lib/editor/slider-utils";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export function CanvasSettingsCard() {
  const settings = useEditorStore((s) => s.timeline.settings);
  const updateSettings = useEditorStore((s) => s.updateSettings);
  const setResetConfirmOpen = useEditorStore((s) => s.setResetConfirmOpen);

  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-3">
      <p className="text-xs font-medium text-zinc-400">Timeline</p>

      <div className="flex items-center justify-between">
        <div className="min-w-0 pr-2">
          <Label className="text-[10px] text-zinc-500">Transitions</Label>
          <p className="text-[9px] leading-snug text-zinc-600">
            Blend neighboring scenes, or turn off for hard cuts.
          </p>
        </div>
        <Switch
          checked={settings.showTransitions}
          onCheckedChange={(c) => updateSettings({ showTransitions: c })}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-[10px] text-zinc-500">Captions</Label>
        <Switch
          checked={settings.captionsEnabled}
          onCheckedChange={(c) => updateSettings({ captionsEnabled: c })}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-[10px] text-zinc-500">Snap</Label>
        <Switch
          checked={settings.snappingEnabled}
          onCheckedChange={(c) => updateSettings({ snappingEnabled: c })}
        />
      </div>

      <div className="space-y-2 border-t border-white/10 pt-2">
        {(
          [
            { key: "narrationVolume" as const, label: "Narration" },
            { key: "musicVolume" as const, label: "Music" },
            { key: "sfxVolume" as const, label: "SFX + whooshes" },
            { key: "clipAudioVolume" as const, label: "Original footage" },
          ] as const
        ).map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <div className="flex justify-between text-[10px] text-zinc-500">
              <Label>{label}</Label>
              <span>{settings[key]}%</span>
            </div>
            <Slider
              value={[settings[key]]}
              max={100}
              step={1}
              onValueChange={(v) => updateSettings({ [key]: sliderValue(v) })}
            />
          </div>
        ))}
        <p className="text-[9px] leading-snug text-zinc-600">
          Unmuted footage joins the export mix. Playback speed changes the preview only.
        </p>
      </div>

      <details className="text-xs text-zinc-400"><summary className="cursor-pointer py-1">Advanced timeline controls</summary><div className="space-y-1 pt-2">
        <Label className="text-[10px] text-zinc-500">Zoom</Label>
        <Slider
          value={[settings.zoom]}
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={1}
          onValueChange={(v) => updateSettings({ zoom: sliderValue(v) })}
        />
      </div></details>

      <Button
        variant="outline"
        size="sm"
        className="w-full border-red-500/30 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
        onClick={() => setResetConfirmOpen(true)}
      >
        Reset timeline
      </Button>
    </div>
  );
}
