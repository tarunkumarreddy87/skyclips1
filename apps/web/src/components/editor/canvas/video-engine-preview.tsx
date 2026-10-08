"use client";

import { memo, useEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties } from "react";
import type { TimelineManifestV1 } from "@hanuman/shared-types";
import { evaluateMediaFrame, evaluateClipEffects, renderGraphicsFrame, timelineAudioCues, type MediaFrame } from "@hanuman/video-engine";
import { useEditorStore } from "@/lib/editor/store";
import { isPreviewAudioGateBlocked, subscribePreviewAudioGate } from "@/lib/editor/preview-audio-transport";
import { ensureEngineFontsLoaded } from "@/lib/editor/engine-fonts";
import { themeGradeCssFilter } from "@/lib/editor/theme-grade-css";
import { getTheme } from "@hanuman/shared-types";
import { NativeTemplateCanvas } from "./native-template-canvas";
import { useNativeTemplateEvents } from "./use-native-template-events";
import { ThreeSceneCanvas } from "./three-scene-canvas";
import { NativeCueAudio } from "./native-cue-audio";
import { HtmlTemplateFrame } from "@hanuman/video-engine/preview";
import { PRESS_CUTOUT_TEMPLATE_ID } from "@hanuman/video-engine/press-cutout";
function PreviewMedia({ layer, playing, speed, volume, grade, fps }: {
  layer: MediaFrame; playing: boolean; speed: number; volume: number; grade: string; fps: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const desiredTime = useRef(layer.sourceTimeSec);
  desiredTime.current = layer.sourceTimeSec;
  const { clip, motion, transition } = layer;
  const allowPlayback = playing && !layer.held;
  const width = 1920;
  const height = 1080;
  const localSec = layer.sourceTimeSec - (clip.source_start_sec ?? 0);
  const effects = evaluateClipEffects(clip.visual_effects, localSec, fps);
  const mediaStyle: CSSProperties = {
    position: "absolute", width: "100%", height: "100%", left: `${motion.x}%`, top: `${motion.y}%`,
    transform: `translate(-50%, -50%) translate(${motion.offsetX / width * 100}%, ${motion.offsetY / height * 100}%) rotate(${motion.rotation}deg) scale(${motion.scaleX}, ${motion.scaleY})`,
    opacity: motion.opacity,
    clipPath: motion.reveal < 1 ? `inset(0 ${(1 - motion.reveal) * 100}% 0 0)` : undefined,
    filter: [grade, effects.filter].filter(Boolean).join(" ") || undefined,
  };

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.playbackRate = speed;
    element.volume = Math.max(0, Math.min(1, volume));
    element.muted = clip.muted === true || layer.held || volume <= 0.001;
    const seek = () => {
      if (Math.abs(element.currentTime - desiredTime.current) > 0.04) element.currentTime = desiredTime.current;
    };
    if (!allowPlayback) { element.pause(); try { seek(); } catch { /* metadata pending */ } }
    else {
      if (Math.abs(element.currentTime - desiredTime.current) > 0.25) { try { seek(); } catch { /* metadata pending */ } }
      void element.play().catch(() => undefined);
    }
    return () => element.pause();
  }, [allowPlayback, clip.src, clip.muted, clip.source_start_sec, clip.start_sec, layer.held, speed, volume]);

  useEffect(() => {
    const element = video.current;
    if (!element || element.readyState < 1) return;
    const difference = layer.sourceTimeSec - element.currentTime;
    // Paused scrubs must seek in both directions. Playback corrects coarse drift only.
    if ((!allowPlayback && Math.abs(difference) > 0.035) || (allowPlayback && Math.abs(difference) > 0.45)) {
      try { element.currentTime = layer.sourceTimeSec; } catch { /* unavailable media */ }
    }
  }, [allowPlayback, layer.sourceTimeSec]);

  const source = clip.src.startsWith("color:") ? clip.src.slice(6) : null;
  const templateScene = useMemo(() => ({...clip.motion_template, imageUrl: source ? undefined : clip.src}), [clip.motion_template, clip.src, source]);
  const media = clip.three_scene ? <ThreeSceneCanvas scene={clip.three_scene} seconds={layer.sourceTimeSec} /> : source ? <div style={{ width: "100%", height: "100%", background: source }} />
    : clip.type === "video" ? <video ref={video} src={clip.src} playsInline preload="auto"
      onLoadedMetadata={() => { if (video.current) { video.current.currentTime = desiredTime.current; if (allowPlayback) void video.current.play().catch(() => undefined); } }}
      style={{ width: "100%", height: "100%", objectFit: clip.fit ?? "cover" }} />
    : <img src={clip.src} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: clip.fit ?? "cover" }} />;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: transition.opacity,
      transform: `translate(${transition.translateXPct}%, ${transition.translateYPct}%) scale(${transition.scale})`,
      clipPath: transition.clipPath, zIndex: Math.max(0, motion.zIndex) }}>
      <div style={mediaStyle}>
        {clip.motion_template?.html_template ? <div className="absolute inset-0" style={{pointerEvents:"auto"}}><HtmlTemplateFrame
          template={clip.motion_template.html_template} seconds={layer.sourceTimeSec}
          scene={templateScene}
          edits={clip.motion_template.layer_edits}
          onSelect={layer => window.dispatchEvent(new CustomEvent("hanuman-template-layer", {detail:{clipId:clip.id,layer}}))}
          onSelectScene={() => window.dispatchEvent(new CustomEvent("hanuman-template-layer", {detail:{clipId:clip.id}}))}
        /></div> : clip.motion_template && !clip.three_scene ? <NativeTemplateCanvas template={clip.motion_template} clipId={clip.id} localSec={localSec} durationSec={clip.duration_sec} media={source ? undefined : media} /> : <>
          <div className="absolute inset-0" style={{ transform: effects.transform || undefined, opacity: effects.opacity }}>{media}</div>
          {effects.overlay === "vignette" ? <div className="pointer-events-none absolute inset-0" style={{ boxShadow: `inset 0 0 ${200 + effects.amount * 300}px ${effects.amount * 130}px #000000bb` }}/> : null}
          {effects.overlay === "scanlines" ? <div className="pointer-events-none absolute inset-0" style={{ background: "repeating-linear-gradient(0deg,transparent 0px,transparent 3px,#000 4px,#000 5px)", opacity: effects.amount * 0.45 }}/> : null}
        </>}
      </div>
    </div>
  );
}

/** The editor clock owns playback. Rendering seeks directly to an immutable scene timestamp. */
function VideoEnginePreviewInner({ manifest: manifestInput, className }: { manifest: unknown; className?: string }) {
  const manifest = manifestInput as TimelineManifestV1;
  useNativeTemplateEvents();
  const playhead = useEditorStore((state) => state.ui.playheadMs);
  const scrub = useEditorStore((state) => state.ui.previewScrubMs);
  const playing = useEditorStore((state) => state.ui.isPlaying);
  const speed = useEditorStore((state) => state.ui.playbackSpeed);
  const muted = useEditorStore((state) => Boolean(state.timeline.settings.previewMuted));
  const audioBlocked = useSyncExternalStore(subscribePreviewAudioGate, isPreviewAudioGateBlocked, () => false);
  const timeSec = (scrub ?? playhead) / 1000;
  const layers = useMemo(() => evaluateMediaFrame(manifest, timeSec), [manifest, timeSec]);
  const svg = useMemo(() => renderGraphicsFrame(manifest, timeSec, { includeTemplates: false }), [manifest, timeSec]);
  const grade = useMemo(() => themeGradeCssFilter(getTheme(manifest.settings?.theme_id).visualGrade), [manifest.settings?.theme_id]);
  useEffect(() => { ensureEngineFontsLoaded(); }, []);
  const audioVolume = muted ? 0 : manifest.settings?.clip_audio_volume ?? 0;
  const cues = useMemo(() => timelineAudioCues(manifest), [manifest]);
  const nearbyCues = cues.filter(cue => cue.startSec <= timeSec + 2 && cue.startSec + cue.durationSec > timeSec);
  const playMedia = playing && scrub == null && !audioBlocked;
  const sfxVolume = muted ? 0 : manifest.settings?.sfx_volume ?? 0.7;
  return (
    <div className={className} data-video-engine-preview style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {layers.map((layer) => <PreviewMedia key={layer.clip.id} layer={layer} playing={playMedia} speed={speed || 1}
        volume={audioVolume} grade={grade ?? ""} fps={manifest.metadata.fps} />)}
      <div className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" style={{ zIndex: 100 }} dangerouslySetInnerHTML={{ __html: svg }} />
      {nearbyCues.map(cue => <NativeCueAudio key={cue.id} cue={cue} timeSec={timeSec} playing={playMedia} speed={speed || 1} volume={sfxVolume} />)}
    </div>
  );
}

export const VideoEnginePreview = memo(VideoEnginePreviewInner);
