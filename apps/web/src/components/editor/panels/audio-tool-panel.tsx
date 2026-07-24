"use client";

import { useEditorStore } from "@/lib/editor/store";
import { sliderValue } from "@/lib/editor/slider-utils";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

export function AudioToolPanel() {
  const selectedItem = useEditorStore((s) => s.getSelectedItem());
  const updateAudioVolume = useEditorStore((s) => s.updateAudioVolume);
  const assets = useEditorStore((s) => s.assets).filter((a) => a.mediaType === "audio");

  const audioItem =
    selectedItem && (selectedItem.type === "narration" || selectedItem.type === "music" || selectedItem.type === "sfx")
      ? selectedItem
      : null;

  return (
    <div className="space-y-4 p-3">
      <p className="text-xs text-zinc-500">
        Narration, music, and SFX clips mix into the Remotion MP4. Global levels are in Canvas &amp;
        timeline settings. Clip media audio (A-roll) is preview-only.
      </p>

      {audioItem && (
        <div className="space-y-2 rounded-lg border border-white/10 p-2">
          <p className="text-xs font-medium text-zinc-400">Selected clip: {audioItem.label}</p>
          <div className="flex justify-between text-[10px] text-zinc-500">
            <Label>Clip volume</Label>
            <span>{audioItem.volume}%</span>
          </div>
          <Slider
            value={[audioItem.volume]}
            max={100}
            step={1}
            onValueChange={(v) => updateAudioVolume(audioItem.id, sliderValue(v))}
          />
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs font-medium text-zinc-400">Project audio assets</p>
        {assets.length === 0 ? (
          <p className="text-[10px] text-zinc-600">No audio assets in this timeline.</p>
        ) : (
          assets.map((a) => (
            <p key={a.id} className="truncate text-[10px] text-zinc-500">
              {a.label}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
