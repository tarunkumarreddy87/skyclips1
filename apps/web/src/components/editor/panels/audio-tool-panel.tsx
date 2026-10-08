"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { requestMediaUploadUrl, uploadFileToPresignedUrl } from "@/lib/api-client";
import { probeUploadDuration } from "@/lib/editor/probe-upload";
import { SOUND_EFFECTS, uploadSoundEffect, type SoundEffectId } from "@/lib/editor/sound-effects";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/lib/editor/store";
import { sliderValue } from "@/lib/editor/slider-utils";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { TransitionSoundLibrary } from "./transition-sound-library";

export function AudioToolPanel() {
  const selectedItem = useEditorStore((s) => s.getSelectedItem());
  const updateAudioVolume = useEditorStore((s) => s.updateAudioVolume);
  const updateAudioFades = useEditorStore((s) => s.updateAudioFades);
  const addMusic = useEditorStore((s) => s.addMusic);
  const addSfx = useEditorStore((s) => s.addSfx);
  const projectId = useEditorStore((s) => s.project.id);
  const assets = useEditorStore((s) => s.assets).filter((a) => a.mediaType === "audio");
  const fileRef = useRef<HTMLInputElement>(null);
  const audioLane = useRef<"music" | "sfx">("music");
  const [uploading, setUploading] = useState(false);

  async function addBuiltIn(id: SoundEffectId) {
    setUploading(true);
    try { const sound = await uploadSoundEffect(projectId, id); addSfx(sound); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Sound cue upload failed"); }
    finally { setUploading(false); }
  }

  async function upload(file: File | undefined) {
    if (!file || !file.type.startsWith("audio/")) return;
    setUploading(true);
    try {
      const durationMs = await probeUploadDuration(file);
      const upload = await requestMediaUploadUrl(projectId, file.name, file.type);
      await uploadFileToPresignedUrl(upload.uploadUrl, file);
      const options = { url: upload.downloadUrl || upload.uploadUrl, sourceKey: upload.s3Key, label: file.name.replace(/\.[^.]+$/, ""), durationMs };
      if (audioLane.current === "music") addMusic(options); else addSfx(options);
      toast.success("Audio uploaded");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Audio upload failed"); }
    finally { setUploading(false); }
  }

  const audioItem =
    selectedItem && (selectedItem.type === "narration" || selectedItem.type === "music" || selectedItem.type === "sfx")
      ? selectedItem
      : null;

  return (
    <div className="flex flex-col gap-4 p-3">
      <p className="text-xs text-zinc-500">
        Mix narration, original footage, music and sound effects. Choose a clip to adjust its level.
      </p>
      <TransitionSoundLibrary />

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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => updateAudioFades(audioItem.id, 0, 0)}>No fades</Button>
            <Button variant="outline" size="sm" onClick={() => { const fade = Math.min(500, (audioItem.endMs - audioItem.startMs) / 3); updateAudioFades(audioItem.id, fade, fade); }}>Soft fades</Button>
          </div>
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
