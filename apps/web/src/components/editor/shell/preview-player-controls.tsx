"use client";

import { useEffect } from "react";
import { Captions, Minimize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useEditorStore } from "@/lib/editor/store";
import { formatTimecode } from "@/lib/editor/utils";
import { IconButton } from "./icon-button";

/** Transport controls use the existing editor store and native playback clock. */
export function PreviewPlayerControls({ onClose }: { onClose: () => void }) {
  const playhead = useEditorStore((s) => s.ui.playheadMs);
  const playing = useEditorStore((s) => s.ui.isPlaying);
  const speed = useEditorStore((s) => s.ui.playbackSpeed);
  const duration = useEditorStore((s) => s.timeline.durationMs);
  const settings = useEditorStore((s) => s.timeline.settings);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const setPlaybackSpeed = useEditorStore((s) => s.setPlaybackSpeed);
  const updateSettings = useEditorStore((s) => s.updateSettings);
  const captionsVisible = settings.captionsEnabled !== false;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.key === "Escape") { onClose(); return; }
      const target = event.target as HTMLElement;
      if (target.closest("input,textarea,select,button,[contenteditable=true]")) return;
      const state = useEditorStore.getState();
      if (event.code === "Space" || event.key.toLowerCase() === "k") {
        event.preventDefault();
        state.setPlaying(!state.ui.isPlaying);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        state.setPlayhead(Math.max(0, Math.min(state.timeline.durationMs, state.ui.playheadMs + (event.key === "ArrowLeft" ? -5000 : 5000))));
      } else if (event.key.toLowerCase() === "m") {
        state.updateSettings({ previewMuted: !state.timeline.settings.previewMuted });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div data-preview-controls role="toolbar" aria-label="Video playback controls" className="relative z-50 shrink-0 border-t border-white/10 bg-[#101114] px-4 pb-[max(8px,env(safe-area-inset-bottom))] pt-3 text-zinc-100 sm:px-6 [&_button]:size-8 [&_button]:rounded-lg [&_button]:text-zinc-100 [&_button]:transition-colors [&_button]:hover:bg-white/10 [&_button_svg]:size-4">
      <input aria-label="Seek preview" type="range" min={0} max={Math.max(1, duration)} step={1000 / 30}
        value={Math.min(playhead, duration)} onChange={(e) => setPlayhead(Number(e.target.value))}
        className="mb-2 block h-1 w-full cursor-pointer accent-blue-400" />
      <div className="flex items-center gap-2 sm:gap-4">
        <IconButton className="!bg-blue-500 hover:!bg-blue-600" title={playing ? "Pause preview" : "Play preview"} onClick={() => {
          if (playhead >= duration) setPlayhead(0);
          setPlaying(!playing);
        }}>{playing ? <Pause /> : <Play />}</IconButton>
        <span className="font-mono text-xs tabular-nums">{formatTimecode(playhead)} / {formatTimecode(duration)}</span>
        <div className="flex items-center gap-2">
          <IconButton title={settings.previewMuted ? "Unmute preview" : "Mute preview"}
            onClick={() => updateSettings({ previewMuted: !settings.previewMuted })}>
            {settings.previewMuted ? <VolumeX /> : <Volume2 />}
          </IconButton>
          <input aria-label="Preview volume" type="range" min={0} max={1} step={0.05}
            value={settings.previewVolume ?? 1} onChange={(e) => updateSettings({ previewVolume: Number(e.target.value), previewMuted: false })}
            className="h-1 w-12 accent-blue-400 sm:w-24" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select aria-label="Preview playback speed" value={speed} onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            className="h-8 rounded-full border border-white/15 bg-zinc-900/80 px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-white/60">
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
          </select>
          <IconButton className={captionsVisible ? "bg-blue-500/20 !text-blue-300" : "!text-zinc-500"} title={captionsVisible ? "Hide captions" : "Show captions"} aria-pressed={captionsVisible}
            onClick={() => updateSettings({ captionsEnabled: !captionsVisible })}><Captions /></IconButton>
          <IconButton title="Exit preview" onClick={onClose}><Minimize2 /></IconButton>
        </div>
      </div>
    </div>
  );
}
