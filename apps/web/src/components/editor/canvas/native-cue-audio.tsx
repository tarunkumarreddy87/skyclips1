"use client";

import { useEffect, useRef } from "react";
import type { SceneAudioCue } from "@hanuman/video-engine";
import { driftCorrectAudio, preloadPreviewAudio, syncPreviewAudio } from "@/lib/editor/preview-audio-transport";

/** One retained voice per active/upcoming cue; transport changes never restart every frame. */
export function NativeCueAudio({ cue, timeSec, playing, speed, volume }: {
  cue: SceneAudioCue; timeSec: number; playing: boolean; speed: number; volume: number;
}) {
  const audio = useRef<HTMLAudioElement>(null); const clipId = useRef<string | null>(null); const wasPlaying = useRef(false);
  const lastTime = useRef(timeSec); const latestTarget = useRef(0);
  const targetSec = Math.max(0, timeSec - cue.startSec) + (cue.sourceStartSec ?? 0); latestTarget.current = targetSec;
  const active = timeSec >= cue.startSec && timeSec < cue.startSec + cue.durationSec;
  const source = `/sfx/${cue.file}`;
  useEffect(() => { preloadPreviewAudio(audio.current, source); }, [source]);
  useEffect(() => {
    const element = audio.current; if (!element) return;
    const jumped = timeSec - lastTime.current < -0.05 || timeSec - lastTime.current > Math.max(0.6, speed * 0.15);
    lastTime.current = timeSec;
    if (jumped) wasPlaying.current = false;
    const shouldPlay = playing && active && volume > 0.0001;
    syncPreviewAudio({ audio: element, src: source, clipId: cue.id, shouldPlay, targetSec, volume: volume * cue.gain,
      playbackRate: speed, activeClipIdRef: clipId, wasPlayingRef: wasPlaying });
    if (shouldPlay) driftCorrectAudio(element, targetSec, 0.15);
    else if (element.readyState >= 1 && Math.abs(element.currentTime - targetSec) > 0.035) {
      try { element.currentTime = targetSec; } catch { /* metadata pending */ }
    }
  }, [active, cue.id, cue.gain, playing, source, speed, targetSec, timeSec, volume]);
  useEffect(() => {
    const element = audio.current;
    return () => { if (element) syncPreviewAudio({ audio: element, src: null, clipId: null, shouldPlay: false, targetSec: 0, volume: 0, playbackRate: 1, activeClipIdRef: clipId, wasPlayingRef: wasPlaying }); };
  }, []);
  return <audio ref={audio} preload="auto" data-native-scene-cue={cue.id} onLoadedMetadata={() => {
    if (audio.current) { try { audio.current.currentTime = latestTarget.current; } catch { /* unavailable cue */ } }
  }} />;
}
