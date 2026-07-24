"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Info, Lock, Maximize2, Minimize2, Minus, Plus, Unlock } from "lucide-react";
import {
  chapterTitleChromeStyle,
  getTheme,
  overlayChromeFromPalette,
  resolveChapterVariant,
  subscribeCtaChromeStyle,
} from "@hanuman/shared-types";
import { useEditorStore } from "@/lib/editor/store";
import type { AnimationItem, AudioItem, ClipItem, TextItem } from "@/lib/editor/types";
import { CanvasTextOverlay } from "../canvas/canvas-text-overlay";
import { CanvasMediaLayer } from "../canvas/canvas-media-layer";
import { TransformHandles } from "../canvas/transform-handles";
import { CanvasElementToolbar } from "../canvas/canvas-element-toolbar";
import { IconButton } from "./icon-button";
import { resolveMediaUrl } from "@/lib/editor/media-url";
import { mediaBoxStyle, resolveTransform } from "@/lib/editor/transform";
import { previewMotionOverlayStyle, previewMotionStyle } from "@/lib/editor/preview-motion";
import { resolveTextFontFamily, ensureEditorTextFontsLoaded } from "@/lib/editor/text-fonts";
import { findActiveTransitionScrub, dualClipScrubStyles, transitionScrubStyle } from "@/lib/editor/preview-transition";
import {
  motionPresetPreviewNote,
  transitionPreviewNote,
} from "@/lib/editor/export-honesty";
import { themeGradeCssFilter } from "@/lib/editor/theme-grade-css";
import { fadedGain } from "@/lib/editor/audio-fade";
import {
  driftCorrectAudio,
  preloadPreviewAudio,
  stopPreviewAudio,
  syncPreviewAudio,
  warmPreviewAudioUrls,
} from "@/lib/editor/preview-audio-transport";
import {
  buildTimelineManifestV1FromEditorState,
  compositionCaptionFontPx,
  compositionTextFontPx,
} from "@/lib/editor/build-timeline-manifest";
import { isRemotionPreviewEnabled } from "@/lib/editor/preview-engine";
import { cn } from "@/lib/utils";
import { useFitStageSize } from "@/lib/editor/use-fit-stage-size";

const RemotionCanvasPreview = dynamic(
  () =>
    import("../canvas/remotion-canvas-preview").then((m) => m.RemotionCanvasPreview),
  { ssr: false },
);

const FIXED_CAPTION_Y = 84;

/** Hit-target box for captions / freeform text — always explicit % width (never max-content). */
function textHitBoxStyle(
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    zIndex: number;
  },
  opts?: { bakeScaleIntoFont?: boolean; boxWidthPct?: number },
): CSSProperties {
  const bake = opts?.bakeScaleIntoFont;
  const flipX = Math.sign(transform.scaleX) || 1;
  const flipY = Math.sign(transform.scaleY) || 1;
  const widthPct = Math.max(18, Math.min(88, opts?.boxWidthPct ?? 56));
  return {
    position: "absolute",
    left: `${transform.x}%`,
    top: `${transform.y}%`,
    transform: bake
      ? `translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${flipX}, ${flipY})`
      : `translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${transform.scaleX}, ${transform.scaleY})`,
    transformOrigin: "center center",
    // Explicit width → side handles reflow copy horizontally (Creativly-style).
    width: `${widthPct}%`,
    zIndex: transform.zIndex,
    overflow: "visible",
  };
}

function findActiveClipsOfType(
  tracks: ReturnType<typeof useEditorStore.getState>["timeline"]["tracks"],
  playheadMs: number,
  trackType: "video" | "broll",
): ClipItem[] {
  const track = tracks.find((t) => t.type === trackType && !t.hidden);
  if (!track) return [];
  return track.items.filter((item) => {
    if (item.hidden) return false;
    if (playheadMs < item.startMs || playheadMs >= item.endMs) return false;
    return item.type === "video" || item.type === "broll";
  }) as ClipItem[];
}

function findActiveNarrationClip(
  tracks: ReturnType<typeof useEditorStore.getState>["timeline"]["tracks"],
  playheadMs: number,
): AudioItem | null {
  const track = tracks.find((t) => t.type === "narration" && !t.hidden);
  if (!track) return null;
  for (const item of track.items) {
    if (item.hidden) continue;
    if (playheadMs >= item.startMs && playheadMs < item.endMs) {
      if (item.type === "narration") return item as AudioItem;
    }
  }
  return null;
}

function findActiveMusicClip(
  tracks: ReturnType<typeof useEditorStore.getState>["timeline"]["tracks"],
  playheadMs: number,
): AudioItem | null {
  const track = tracks.find((t) => t.type === "music" && !t.hidden);
  if (!track) return null;
  for (const item of track.items) {
    if (item.hidden) continue;
    if (playheadMs >= item.startMs && playheadMs < item.endMs && item.type === "music") {
      return item as AudioItem;
    }
  }
  return null;
}

function findActiveSfxClip(
  tracks: ReturnType<typeof useEditorStore.getState>["timeline"]["tracks"],
  playheadMs: number,
): AudioItem | null {
  const track = tracks.find((t) => t.type === "sfx" && !t.hidden);
  if (!track) return null;
  for (const item of track.items) {
    if (item.hidden) continue;
    if (playheadMs >= item.startMs && playheadMs < item.endMs && item.type === "sfx") {
      return item as AudioItem;
    }
  }
  return null;
}

export function PreviewSection() {
  const playheadMs = useEditorStore((s) => s.ui.playheadMs);
  const isPlaying = useEditorStore((s) => s.ui.isPlaying);
  const playbackSpeed = useEditorStore((s) => s.ui.playbackSpeed);
  const tracks = useEditorStore((s) => s.timeline.tracks);
  const narrationVolume = useEditorStore((s) => s.timeline.settings.narrationVolume);
  const musicVolume = useEditorStore((s) => s.timeline.settings.musicVolume);
  const sfxVolume = useEditorStore((s) => s.timeline.settings.sfxVolume);
  const previewMuted = useEditorStore((s) => Boolean(s.timeline.settings.previewMuted));
  const captionsEnabled = useEditorStore((s) => s.timeline.settings.captionsEnabled);
  const overlayDropShadow = useEditorStore((s) => s.timeline.settings.overlayDropShadow);
  const themeId = useEditorStore((s) => s.timeline.settings.themeId ?? "standard");
  const backgroundColor = useEditorStore((s) => s.timeline.settings.backgroundColor);
  const backgroundImage = useEditorStore((s) => s.timeline.settings.backgroundImage);
  const selectedItemId = useEditorStore((s) => s.ui.selectedItemId);
  const transitions = useEditorStore((s) => s.timeline.transitions);
  const showTransitions = useEditorStore((s) => s.timeline.settings.showTransitions);
  const selectItem = useEditorStore((s) => s.selectItem);
  const setRightPanelOpen = useEditorStore((s) => s.setRightPanelOpen);
  const updateItemTransform = useEditorStore((s) => s.updateItemTransform);
  const updateTextItem = useEditorStore((s) => s.updateTextItem);
  const updateAnimationItem = useEditorStore((s) => s.updateAnimationItem);
  const getAsset = useEditorStore((s) => s.getAsset);
  const captionStyle = useEditorStore((s) => s.timeline.settings.captionStyle);
  const clipAudioVolume = useEditorStore((s) => s.timeline.settings.clipAudioVolume);
  const assets = useEditorStore((s) => s.assets);
  const durationMs = useEditorStore((s) => s.timeline.durationMs);
  const remotionPreview = isRemotionPreviewEnabled();
  const theme = useMemo(() => getTheme(themeId), [themeId]);
  const overlayChrome = useMemo(
    () =>
      overlayChromeFromPalette(theme.palette, {
        chapterFontSize: theme.chapterFontSize,
        ctaFontSize: theme.ctaFontSize,
      }),
    [theme],
  );
  const gradeFilter = useMemo(() => themeGradeCssFilter(theme.visualGrade), [theme]);

  useEffect(() => {
    ensureEditorTextFontsLoaded();
  }, []);

  const arollFillDoneRef = useRef<string | null>(null);
  const repairArollFullFrameSilent = useEditorStore((s) => s.repairArollFullFrameSilent);

  // Once per project load: heal corrupt A-roll transforms only.
  // Do NOT auto-fill timeline gaps — empty time must preview as black (NLE truth).
  useEffect(() => {
    if (!remotionPreview) return;
    const projectId = useEditorStore.getState().project.id;
    if (arollFillDoneRef.current === projectId) return;
    const videoTrack = tracks.find((t) => t.type === "video");
    if (!videoTrack?.items.length) return;
    repairArollFullFrameSilent();
    arollFillDoneRef.current = projectId;
  }, [remotionPreview, tracks, repairArollFullFrameSilent]);

  const remotionBuild = useMemo(() => {
    if (!remotionPreview) return { manifest: null as ReturnType<typeof buildTimelineManifestV1FromEditorState> | null, error: null as string | null };
    const state = useEditorStore.getState();
    try {
      return {
        manifest: buildTimelineManifestV1FromEditorState(state.project.id, state, {
          srcMode: "browser",
        }),
        error: null as string | null,
      };
    } catch (err) {
      return {
        manifest: null,
        error: err instanceof Error ? err.message : "Could not build Remotion preview manifest",
      };
    }
  }, [
    remotionPreview,
    tracks,
    transitions,
    captionsEnabled,
    narrationVolume,
    musicVolume,
    sfxVolume,
    clipAudioVolume,
    themeId,
    showTransitions,
    captionStyle,
    assets,
    durationMs,
  ]);
  const remotionManifest = remotionBuild.manifest;
  const remotionManifestError = remotionBuild.error;

  const frameRef = useRef<HTMLDivElement>(null);
  const stageHostRef = useRef<HTMLDivElement>(null);
  const narrationRef = useRef<HTMLAudioElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const sfxRef = useRef<HTMLAudioElement>(null);
  const activeNarrationIdRef = useRef<string | null>(null);
  const activeMusicIdRef = useRef<string | null>(null);
  const activeSfxIdRef = useRef<string | null>(null);
  const narrationWasPlayingRef = useRef(false);
  const musicWasPlayingRef = useRef(false);
  const sfxWasPlayingRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canvasZoomPct, setCanvasZoomPct] = useState(100);
  const [canvasLocked, setCanvasLocked] = useState(false);
  // Canvas always fits the workspace now; timeline zoom remains the editing zoom control.
  const showCanvasControls = false;

  // Exact 16:9 fit — CSS aspect-ratio + max-height was squashing the stage (~3:1).
  const fitSize = useFitStageSize(stageHostRef, 16 / 9, 0);
  const stageWidth = Math.max(0, Math.round(fitSize.width));
  const stageHeight = Math.max(0, Math.round(fitSize.height));

  const activeVideoClips = useMemo(
    () => findActiveClipsOfType(tracks, playheadMs, "video"),
    [tracks, playheadMs],
  );
  const activeBrollClips = useMemo(
    () => findActiveClipsOfType(tracks, playheadMs, "broll"),
    [tracks, playheadMs],
  );

  const activeNarration = useMemo(
    () => findActiveNarrationClip(tracks, playheadMs),
    [tracks, playheadMs],
  );

  const activeMusic = useMemo(
    () => findActiveMusicClip(tracks, playheadMs),
    [tracks, playheadMs],
  );
  const activeSfx = useMemo(() => findActiveSfxClip(tracks, playheadMs), [tracks, playheadMs]);

  const narrationAsset = activeNarration ? getAsset(activeNarration.assetId) : undefined;
  const narrationSrc = narrationAsset?.mediaType === "audio" ? resolveMediaUrl(narrationAsset.url) : null;
  const narrationLocalMs = activeNarration ? playheadMs - activeNarration.startMs : 0;
  const narrationGain = useMemo(() => {
    if (!activeNarration || previewMuted) return 0;
    const global = Math.max(0, Math.min(1, narrationVolume / 100));
    const clip = Math.max(0, Math.min(1, activeNarration.volume / 100));
    const dur = activeNarration.endMs - activeNarration.startMs;
    return fadedGain(narrationLocalMs, dur, global * clip, activeNarration.fadeIn, activeNarration.fadeOut);
  }, [activeNarration, narrationLocalMs, narrationVolume, previewMuted]);

  const musicAsset = activeMusic ? getAsset(activeMusic.assetId) : undefined;
  const musicSrc = musicAsset?.mediaType === "audio" ? resolveMediaUrl(musicAsset.url) : null;
  const musicLocalMs = activeMusic ? playheadMs - activeMusic.startMs : 0;
  const musicGain = useMemo(() => {
    if (!activeMusic || previewMuted) return 0;
    const global = Math.max(0, Math.min(1, musicVolume / 100));
    const clip = Math.max(0, Math.min(1, activeMusic.volume / 100));
    const dur = activeMusic.endMs - activeMusic.startMs;
    let gain = fadedGain(musicLocalMs, dur, global * clip, activeMusic.fadeIn, activeMusic.fadeOut);
    // Duck under narration (matches Remotion MUSIC_DUCK_UNDER_NARRATION ≈ 0.22).
    if (activeNarration) gain *= 0.22;
    return gain;
  }, [activeMusic, musicLocalMs, musicVolume, activeNarration, previewMuted]);

  const sfxAsset = activeSfx ? getAsset(activeSfx.assetId) : undefined;
  const sfxSrc = sfxAsset?.mediaType === "audio" ? resolveMediaUrl(sfxAsset.url) : null;
  const sfxLocalMs = activeSfx ? playheadMs - activeSfx.startMs : 0;
  const sfxGain = useMemo(() => {
    if (!activeSfx || previewMuted) return 0;
    const global = Math.max(0, Math.min(1, sfxVolume / 100));
    const clip = Math.max(0, Math.min(1, activeSfx.volume / 100));
    const dur = activeSfx.endMs - activeSfx.startMs;
    return fadedGain(sfxLocalMs, dur, global * clip, activeSfx.fadeIn, activeSfx.fadeOut);
  }, [activeSfx, sfxLocalMs, sfxVolume, previewMuted]);

  const visibleOverlays = useMemo(() => {
    const texts: TextItem[] = [];
    const captions: TextItem[] = [];
    for (const track of tracks) {
      if (track.type !== "text" && track.type !== "captions") continue;
      if (track.type === "captions" && !captionsEnabled) continue;
      for (const item of track.items) {
        if (item.hidden) continue;
        if (playheadMs < item.startMs || playheadMs >= item.endMs) continue;
        if (item.type === "text") texts.push(item as TextItem);
        if (item.type === "captions") captions.push(item as TextItem);
      }
    }
    // One caption at a time — shortest window wins (matches Remotion resolveCaptionOverlapWindows).
    captions.sort(
      (a, b) =>
        a.endMs - a.startMs - (b.endMs - b.startMs) ||
        b.startMs - a.startMs ||
        a.id.localeCompare(b.id),
    );
    const topCaption = captions[0] ? [captions[0]] : [];
    return [...texts, ...topCaption];
  }, [tracks, playheadMs, captionsEnabled]);

  const visibleMotion = useMemo(() => {
    const items: AnimationItem[] = [];
    const track = tracks.find((t) => t.type === "animation" && !t.hidden);
    if (!track) return items;
    for (const item of track.items) {
      if (item.hidden || item.type !== "animation") continue;
      if (playheadMs >= item.startMs && playheadMs < item.endMs) {
        items.push(item);
      }
    }
    return items;
  }, [tracks, playheadMs]);

  const transitionScrub = useMemo(() => {
    if (!showTransitions) return null;
    const items = tracks.flatMap((t) => t.items);
    return findActiveTransitionScrub(playheadMs, transitions, items);
  }, [playheadMs, transitions, tracks, showTransitions]);

  const dualStyles = useMemo(
    () => (transitionScrub ? dualClipScrubStyles(transitionScrub.type, transitionScrub.progress) : null),
    [transitionScrub],
  );

  const scrubVisual = useMemo(
    () => (transitionScrub ? transitionScrubStyle(transitionScrub.type, transitionScrub.progress) : null),
    [transitionScrub],
  );

  const previewApproxLabel = useMemo(() => {
    const reasons: string[] = [];
    // editorClock dual-clip blends ≈ CSS; export uses TransitionSeries (richer).
    if (transitionScrub && transitionPreviewNote(transitionScrub.type) === "approx") {
      reasons.push(`${transitionScrub.type} transition`);
    }
    if (!(remotionPreview && remotionManifest)) {
      for (const motion of visibleMotion) {
        if (motionPresetPreviewNote(motion.preset) === "approx") {
          const name =
            motion.preset === "subscribe-cta"
              ? "Subscribe CTA"
              : motion.preset === "lower-third"
                ? "Lower third"
                : "Chapter title";
          if (!reasons.includes(name)) reasons.push(name);
        }
      }
    }
    if (!reasons.length) return null;
    if (remotionPreview && remotionManifest) {
      return `${reasons.slice(0, 2).join(" · ")} — MP4 TransitionSeries is richer`;
    }
    return `${reasons.slice(0, 2).join(" · ")} — Remotion export is richer`;
  }, [transitionScrub, visibleMotion, remotionPreview, remotionManifest]);

  const previewVideoClips = useMemo(() => {
    const byId = new Map(
      tracks.flatMap((t) => t.items).filter((i): i is ClipItem => i.type === "video" || i.type === "broll").map((i) => [i.id, i]),
    );
    const list = [...activeVideoClips];
    if (transitionScrub?.toItemId) {
      const incoming = byId.get(transitionScrub.toItemId);
      if (incoming && incoming.type === "video" && !list.some((c) => c.id === incoming.id)) {
        list.push(incoming);
      }
    }
    return list;
  }, [activeVideoClips, tracks, transitionScrub]);

  const toggleFullscreen = useCallback(async () => {
    const el = frameRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      /* browser blocked or unsupported */
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === frameRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // --- Narration / music / sfx transport -------------------------------------
  // IMPORTANT: these effects must NOT depend on `playheadMs`. The playhead changes
  // ~30x/sec during playback, and depending on it caused the audio to be re-seeked
  // and replayed every frame ("voice repeating / stuttering"). The transport reads
  // the current playhead via getState() only when a clip/speed/volume actually changes.
  // Drift correction runs on a coarse interval below, never per-frame.

  // Narration — always editor clock (matches timeline playhead + Remotion editorClock preview).
  useEffect(() => {
    const audio = narrationRef.current;
    if (!audio) return;
    const ph = useEditorStore.getState().ui.playheadMs;
    const localMs = activeNarration ? ph - activeNarration.startMs : 0;
    const dur = activeNarration ? Math.max(1, activeNarration.endMs - activeNarration.startMs) : 1;
    const targetSec =
      (activeNarration?.sourceStartMs ?? 0) / 1000 + Math.max(0, localMs) / 1000;
    const global = Math.max(0, Math.min(1, narrationVolume / 100));
    const clip = activeNarration ? Math.max(0, Math.min(1, activeNarration.volume / 100)) : 0;
    const vol =
      activeNarration && isPlaying && !previewMuted
        ? fadedGain(localMs, dur, global * clip, activeNarration.fadeIn, activeNarration.fadeOut)
        : 0;
    syncPreviewAudio({
      audio,
      src: narrationSrc,
      shouldPlay: Boolean(isPlaying && activeNarration && narrationSrc && !previewMuted),
      targetSec,
      volume: vol,
      playbackRate: playbackSpeed,
      clipId: activeNarration?.id ?? null,
      activeClipIdRef: activeNarrationIdRef,
      wasPlayingRef: narrationWasPlayingRef,
      gatePlayhead: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNarration?.id, isPlaying, narrationSrc, playbackSpeed, narrationVolume, previewMuted]);

  // Live volume / fade curve while playing (no transport restart).
  useEffect(() => {
    const audio = narrationRef.current;
    if (!audio || !isPlaying) return;
    audio.volume = Math.max(0, Math.min(1, narrationGain));
    audio.muted = narrationGain <= 0.0001;
  }, [isPlaying, narrationGain]);

  // Music
  useEffect(() => {
    const audio = musicRef.current;
    if (!audio) return;
    const ph = useEditorStore.getState().ui.playheadMs;
    const localMs = activeMusic ? ph - activeMusic.startMs : 0;
    const dur = activeMusic ? Math.max(1, activeMusic.endMs - activeMusic.startMs) : 1;
    const targetSec =
      (activeMusic?.sourceStartMs ?? 0) / 1000 + Math.max(0, localMs) / 1000;
    const global = Math.max(0, Math.min(1, musicVolume / 100));
    const clip = activeMusic ? Math.max(0, Math.min(1, activeMusic.volume / 100)) : 0;
    let vol =
      activeMusic && isPlaying && !previewMuted
        ? fadedGain(localMs, dur, global * clip, activeMusic.fadeIn, activeMusic.fadeOut)
        : 0;
    if (vol > 0 && activeNarration) vol *= 0.22;
    syncPreviewAudio({
      audio,
      src: musicSrc,
      shouldPlay: Boolean(isPlaying && activeMusic && musicSrc && !previewMuted),
      targetSec,
      volume: vol,
      playbackRate: playbackSpeed,
      clipId: activeMusic?.id ?? null,
      activeClipIdRef: activeMusicIdRef,
      wasPlayingRef: musicWasPlayingRef,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMusic?.id, isPlaying, musicSrc, playbackSpeed, musicVolume, previewMuted, activeNarration?.id]);

  useEffect(() => {
    const audio = musicRef.current;
    if (!audio || !isPlaying) return;
    audio.volume = Math.max(0, Math.min(1, musicGain));
    audio.muted = musicGain <= 0.0001;
  }, [isPlaying, musicGain]);

  // SFX
  useEffect(() => {
    const audio = sfxRef.current;
    if (!audio) return;
    const ph = useEditorStore.getState().ui.playheadMs;
    const localMs = activeSfx ? ph - activeSfx.startMs : 0;
    const dur = activeSfx ? Math.max(1, activeSfx.endMs - activeSfx.startMs) : 1;
    const targetSec =
      (activeSfx?.sourceStartMs ?? 0) / 1000 + Math.max(0, localMs) / 1000;
    const global = Math.max(0, Math.min(1, sfxVolume / 100));
    const clip = activeSfx ? Math.max(0, Math.min(1, activeSfx.volume / 100)) : 0;
    const vol =
      activeSfx && isPlaying && !previewMuted
        ? fadedGain(localMs, dur, global * clip, activeSfx.fadeIn, activeSfx.fadeOut)
        : 0;
    syncPreviewAudio({
      audio,
      src: sfxSrc,
      shouldPlay: Boolean(isPlaying && activeSfx && sfxSrc && !previewMuted),
      targetSec,
      volume: vol,
      playbackRate: playbackSpeed,
      clipId: activeSfx?.id ?? null,
      activeClipIdRef: activeSfxIdRef,
      wasPlayingRef: sfxWasPlayingRef,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSfx?.id, isPlaying, sfxSrc, playbackSpeed, sfxVolume, previewMuted]);

  useEffect(() => {
    const audio = sfxRef.current;
    if (!audio || !isPlaying) return;
    audio.volume = Math.max(0, Math.min(1, sfxGain));
    audio.muted = sfxGain <= 0.0001;
  }, [isPlaying, sfxGain]);

  // Drift correction — ONE coarse timer for all three buses.
  // Never rewind audio (that causes voice to stutter/repeat). Playhead RAF in
  // video-editor-page is the SSOT during play — do NOT nudge playhead to audio
  // (that caused forward jumps followed by RAF snap-back).
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      const s = useEditorStore.getState();
      const ph = s.ui.playheadMs;

      const n = findActiveNarrationClip(s.timeline.tracks, ph);
      if (n) {
        const targetSec =
          (n.sourceStartMs ?? 0) / 1000 + Math.max(0, ph - n.startMs) / 1000;
        driftCorrectAudio(narrationRef.current, targetSec);
      }

      const m = findActiveMusicClip(s.timeline.tracks, ph);
      if (m) {
        driftCorrectAudio(
          musicRef.current,
          (m.sourceStartMs ?? 0) / 1000 + Math.max(0, ph - m.startMs) / 1000,
        );
      }
      const x = findActiveSfxClip(s.timeline.tracks, ph);
      if (x) {
        driftCorrectAudio(
          sfxRef.current,
          (x.sourceStartMs ?? 0) / 1000 + Math.max(0, ph - x.startMs) / 1000,
        );
      }
    }, 750);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // Hard stop when paused / unmount — keep dataset.src so the next Play resumes warm.
  useEffect(() => {
    if (isPlaying) return;
    stopPreviewAudio(narrationRef.current);
    stopPreviewAudio(musicRef.current);
    stopPreviewAudio(sfxRef.current);
  }, [isPlaying]);

  // Warm narration/music/sfx buffers while paused so Play is not a cold network start.
  useEffect(() => {
    if (isPlaying) return;
    preloadPreviewAudio(narrationRef.current, narrationSrc);
    preloadPreviewAudio(musicRef.current, musicSrc);
    preloadPreviewAudio(sfxRef.current, sfxSrc);
  }, [isPlaying, narrationSrc, musicSrc, sfxSrc]);

  // Prefetch upcoming narration URLs into browser cache (once per asset set).
  const warmedNarrationUrlsRef = useRef(new Set<string>());
  useEffect(() => {
    const track = tracks.find((t) => t.type === "narration" && !t.hidden);
    if (!track) return;
    const ph = useEditorStore.getState().ui.playheadMs;
    const upcoming = [...track.items]
      .filter((item) => item.type === "narration" && !item.hidden && item.endMs > ph)
      .sort((a, b) => a.startMs - b.startMs)
      .slice(0, 4);
    const urls: string[] = [];
    for (const item of upcoming) {
      const asset = getAsset((item as AudioItem).assetId);
      if (asset?.mediaType === "audio" && asset.url) {
        const url = resolveMediaUrl(asset.url);
        if (warmedNarrationUrlsRef.current.has(url)) continue;
        warmedNarrationUrlsRef.current.add(url);
        urls.push(url);
      }
    }
    if (urls.length) warmPreviewAudioUrls(urls, 3);
  }, [tracks, assets, getAsset, activeNarration?.id]);

  useEffect(() => {
    return () => {
      stopPreviewAudio(narrationRef.current);
      stopPreviewAudio(musicRef.current);
      stopPreviewAudio(sfxRef.current);
    };
  }, []);

  return (
    <section
      className="relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
      style={{
        backgroundColor: "#121212",
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)
        `,
        backgroundSize: "24px 24px",
      }}
    >
      <div
        ref={stageHostRef}
        className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center px-4 py-3 sm:px-6 sm:py-4"
      >
        <div
          ref={frameRef}
          data-preview-stage
          className={cn(
            "group/frame relative shrink-0 overflow-visible rounded-none border border-white/12 bg-black",
            "shadow-[0_24px_80px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.04)]",
            stageWidth < 8 && "opacity-0",
          )}
          style={{
            width: stageWidth || undefined,
            height: stageHeight || undefined,
            aspectRatio: stageWidth ? undefined : "16 / 9",
            maxWidth: "100%",
            maxHeight: "100%",
            backgroundColor,
            backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            transition: "width 120ms ease-out, height 120ms ease-out",
          }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("[data-transform-frame]")) return;
            selectItem(null);
          }}
        >
        <div
          className="absolute inset-0 overflow-visible"
          style={remotionPreview ? { pointerEvents: "none" } : undefined}
        >
        {/* Clip picture only — selection chrome (toolbar / rotate) can paint outside. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <div
          className="absolute inset-0"
          style={remotionPreview ? { pointerEvents: "none" } : undefined}
        >
        <audio ref={narrationRef} preload="auto" playsInline />
        <audio ref={musicRef} preload="auto" playsInline />
        <audio ref={sfxRef} preload="auto" playsInline />

        {remotionPreview && remotionManifest ? (
          <RemotionCanvasPreview manifest={remotionManifest} />
        ) : null}

        {/* CSS media/caption/motion only when Remotion preview is off (or failed to build). */}
        {!(remotionPreview && remotionManifest) ? (
          <>
        {previewVideoClips.map((clip) => {
          const isFrom = transitionScrub?.fromItemId === clip.id;
          const isTo = transitionScrub?.toItemId === clip.id;
          const layerStyle =
            dualStyles && isFrom ? dualStyles.from : dualStyles && isTo ? dualStyles.to : undefined;
          const forceLocalMs =
            isTo && transitionScrub
              ? Math.max(0, playheadMs - (clip.startMs - transitionScrub.durationMs))
              : null;
          return (
            <CanvasMediaLayer
              key={clip.id}
              clip={clip}
              selected={selectedItemId === clip.id}
              onSelect={() => selectItem(clip.id)}
              gradeFilter={gradeFilter}
              layerStyle={{
                ...(layerStyle ?? {}),
                ...(isTo ? { zIndex: 6 } : isFrom ? { zIndex: 5 } : {}),
              }}
              forceLocalMs={forceLocalMs}
              muteMediaAudio={Boolean(transitionScrub && isFrom)}
            />
          );
        })}

        {activeBrollClips.map((clip) => (
          <CanvasMediaLayer
            key={clip.id}
            clip={clip}
            selected={selectedItemId === clip.id}
            onSelect={() => selectItem(clip.id)}
            gradeFilter={gradeFilter}
          />
        ))}

        {!activeVideoClips.length && !activeBrollClips.length ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-zinc-500">
            <span>No media at playhead</span>
            <span className="text-xs text-zinc-600">Scrub the timeline or press Play</span>
          </div>
        ) : null}

        {visibleOverlays.map((overlay) => (
          <CanvasTextOverlay
            key={overlay.id}
            item={overlay}
            selected={selectedItemId === overlay.id}
            dropShadow={overlayDropShadow}
            onSelect={() => selectItem(overlay.id)}
          />
        ))}

        {scrubVisual ? (
          <div
            className="pointer-events-none absolute inset-0 z-[8] overflow-hidden"
            style={scrubVisual.overlay}
            aria-hidden
          >
            {scrubVisual.curtain ? <div style={scrubVisual.curtain} /> : null}
            {"scratch" in scrubVisual && scrubVisual.scratch ? (
              <div style={scrubVisual.scratch} />
            ) : null}
          </div>
        ) : null}

        {visibleMotion.map((motion) => {
          const isCta = motion.preset === "subscribe-cta";
          const transform = resolveTransform(motion.transform, motion.position);
          const selected = selectedItemId === motion.id;
          const motionStyle = previewMotionOverlayStyle(
            motion.preset,
            motion.animation,
            motion.startMs,
            motion.endMs,
            playheadMs,
          );
          const chapterVariant = resolveChapterVariant(
            motion.preset === "lower-third" ? "lower-third" : "chapter",
            transform.y,
          );
          const ctaChrome = isCta ? subscribeCtaChromeStyle(overlayChrome, { previewScale: true }) : null;
          const chapterChrome = !isCta
            ? chapterTitleChromeStyle(chapterVariant, overlayChrome, { previewScale: true })
            : null;
          const boxWidthPct = Math.max(18, Math.min(88, motion.boxWidthPct ?? 70));
          const uniform = Math.max(
            0.35,
            Math.min(3.5, (Math.abs(transform.scaleX) + Math.abs(transform.scaleY)) / 2),
          );
          const signX = Math.sign(transform.scaleX) || 1;
          const signY = Math.sign(transform.scaleY) || 1;
          const frameStyle: CSSProperties = {
            position: "absolute",
            left: `${transform.x}%`,
            top: `${transform.y}%`,
            transform: isCta
              ? `translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${transform.scaleX}, ${transform.scaleY})`
              : `translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${signX * uniform}, ${signY * uniform})`,
            transformOrigin: "center center",
            zIndex: selected ? Math.max(25, transform.zIndex) : transform.zIndex || 5,
            width: isCta ? "max-content" : `${boxWidthPct}%`,
            maxWidth: isCta ? "85%" : undefined,
            overflow: "visible",
          };
          return (
            <div
              key={motion.id}
              className={cn("pointer-events-auto absolute z-[5]", selected && "z-[25]")}
              style={frameStyle}
              data-transform-frame
              onClick={(e) => {
                e.stopPropagation();
                selectItem(motion.id);
              }}
            >
              <div
                className={cn("flex items-center justify-center", !isCta && "w-full")}
                style={motionStyle}
              >
                {isCta && ctaChrome ? (
                  <span style={ctaChrome.badge as CSSProperties}>
                    <span style={ctaChrome.dot as CSSProperties} />
                    {motion.label || "Subscribe"}
                  </span>
                ) : chapterChrome ? (
                  <span
                    style={{
                      ...(chapterChrome as CSSProperties),
                      maxWidth: "100%",
                      width: "100%",
                      boxSizing: "border-box",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      boxShadow: overlayDropShadow
                        ? String(chapterChrome.boxShadow ?? "0 6px 20px rgba(0,0,0,0.35)")
                        : "none",
                    }}
                  >
                    {motion.label || (chapterVariant === "lower-third" ? "Title" : "Chapter")}
                  </span>
                ) : null}
              </div>
              {selected ? (
                <>
                  <TransformHandles
                    mode={isCta ? "media" : "text"}
                    transform={transform}
                    boxWidthPct={boxWidthPct}
                    onBoxWidthChange={
                      isCta
                        ? undefined
                        : (next) => updateAnimationItem(motion.id, { boxWidthPct: next })
                    }
                    onChange={(next) => {
                      if (isCta) {
                        updateItemTransform(motion.id, next);
                        return;
                      }
                      const sx = Math.sign(next.scaleX) || 1;
                      const sy = Math.sign(next.scaleY) || 1;
                      const u = Math.max(
                        0.35,
                        Math.min(3.5, (Math.abs(next.scaleX) + Math.abs(next.scaleY)) / 2),
                      );
                      updateItemTransform(motion.id, {
                        ...next,
                        scaleX: sx * u,
                        scaleY: sy * u,
                      });
                    }}
                  />
                  <CanvasElementToolbar variant={isCta ? "media" : "text"} />
                </>
              ) : null}
            </div>
          );
        })}
          </>
        ) : null}
        </div>
        </div>

        {/* Remotion preview: hit targets so media/text can be selected & dragged. */}
        {remotionPreview && remotionManifest ? (
          <>
            {[...previewVideoClips, ...activeBrollClips].map((clip) => {
              const transform = resolveTransform(clip.transform);
              const selected = selectedItemId === clip.id;
              const box = mediaBoxStyle(transform);
              return (
                <div
                  key={`hit-${clip.id}`}
                  className="absolute touch-none pointer-events-auto"
                  style={{
                    ...box,
                    // Inline zIndex from mediaBoxStyle must not win over selection.
                    zIndex: selected ? 25 : Math.max(4, transform.zIndex || 0),
                    outline: selected ? "1px solid rgba(255,255,255,0.9)" : undefined,
                  }}
                  data-transform-frame
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    selectItem(clip.id);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectItem(clip.id);
                  }}
                >
                  {selected ? (
                    <>
                      <TransformHandles
                        transform={transform}
                        onChange={(next) => updateItemTransform(clip.id, next)}
                      />
                      <CanvasElementToolbar />
                    </>
                  ) : null}
                </div>
              );
            })}
            {visibleOverlays.map((overlay) => {
              const selected = selectedItemId === overlay.id;
              const isCaption = overlay.type === "captions";
              // Per-caption layout — never snap unrelated cues to a shared FIXED box.
              const transform = resolveTransform(
                overlay.transform,
                isCaption
                  ? overlay.position ?? { x: 50, y: FIXED_CAPTION_Y }
                  : overlay.position,
              );
              const captionTransform = isCaption
                ? { ...transform, zIndex: Math.max(20, transform.zIndex) }
                : transform;
              const uniform = Math.max(
                0.35,
                Math.min(
                  3.5,
                  (Math.abs(captionTransform.scaleX) + Math.abs(captionTransform.scaleY)) / 2,
                ),
              );
              // Captions + freeform share Creativly box-width (never max-content wrap-down).
              const boxWidthPct = Math.max(18, Math.min(88, overlay.boxWidthPct ?? (isCaption ? 72 : 56)));
              const boxStyle = {
                ...textHitBoxStyle(captionTransform, {
                  bakeScaleIntoFont: true,
                  boxWidthPct,
                }),
                zIndex: selected ? 25 : captionTransform.zIndex || (isCaption ? 20 : 12),
                outline: selected ? "1px solid rgba(255,255,255,0.9)" : undefined,
              };
              const previewFontPx = isCaption
                ? Math.round(
                    compositionCaptionFontPx(overlay.fontSize) * (stageHeight / 1080) * uniform,
                  )
                : Math.round(
                    compositionTextFontPx(overlay.fontSize) * (stageHeight / 1080) * uniform,
                  );
              return (
                <div
                  key={`hit-${overlay.id}`}
                  className="pointer-events-auto absolute"
                  style={boxStyle}
                  data-transform-frame
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    selectItem(overlay.id);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectItem(overlay.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    selectItem(overlay.id);
                    setRightPanelOpen(true);
                  }}
                >
                  {isCaption ? (
                    <span
                      aria-hidden
                      className="pointer-events-none invisible block w-full whitespace-pre-wrap break-words px-[0.55em] py-[0.2em] leading-[1.2] tracking-tight"
                      style={{
                        fontSize: previewFontPx,
                        fontWeight: overlay.fontWeight || "800",
                        textAlign: overlay.alignment || "center",
                      }}
                    >
                      {overlay.text || "Caption"}
                    </span>
                  ) : (
                    <span
                      className="pointer-events-none block w-full whitespace-pre-wrap break-words px-[0.55em] py-[0.2em] leading-[1.2] tracking-tight"
                      style={{
                        fontSize: previewFontPx,
                        fontWeight: overlay.fontWeight || "700",
                        color: overlay.color || "#ffffff",
                        textAlign: overlay.alignment || "center",
                        fontFamily: resolveTextFontFamily(overlay.fontFamily),
                        textShadow: overlayDropShadow
                          ? "0 2px 4px rgba(0,0,0,0.85), 0 8px 28px rgba(0,0,0,0.55), 0 0 1px rgba(0,0,0,0.9)"
                          : undefined,
                        ...previewMotionStyle(
                          overlay.animation,
                          overlay.startMs,
                          overlay.endMs,
                          playheadMs,
                        ),
                      }}
                    >
                      {overlay.text || "Text"}
                    </span>
                  )}
                  {selected ? (
                    <>
                      <TransformHandles
                        mode="text"
                        transform={captionTransform}
                        boxWidthPct={boxWidthPct}
                        onBoxWidthChange={(next) =>
                          updateTextItem(overlay.id, { boxWidthPct: next })
                        }
                        onChange={(next) => {
                          const signX = Math.sign(next.scaleX) || 1;
                          const signY = Math.sign(next.scaleY) || 1;
                          const u = Math.max(
                            0.35,
                            Math.min(3.5, (Math.abs(next.scaleX) + Math.abs(next.scaleY)) / 2),
                          );
                          updateItemTransform(overlay.id, {
                            ...next,
                            scaleX: signX * u,
                            scaleY: signY * u,
                          });
                        }}
                      />
                      <CanvasElementToolbar variant="text" />
                    </>
                  ) : null}
                </div>
              );
            })}
            {visibleMotion.map((motion) => {
              const transform = resolveTransform(motion.transform, motion.position);
              const selected = selectedItemId === motion.id;
              const isCta = motion.preset === "subscribe-cta";
              const chapterVariant = resolveChapterVariant(
                motion.preset === "lower-third" ? "lower-third" : "chapter",
                transform.y,
              );
              const ctaChrome = isCta
                ? subscribeCtaChromeStyle(overlayChrome, { previewScale: true })
                : null;
              const chapterChrome = !isCta
                ? chapterTitleChromeStyle(chapterVariant, overlayChrome, { previewScale: true })
                : null;
              const boxWidthPct = Math.max(18, Math.min(88, motion.boxWidthPct ?? 70));
              const uniform = Math.max(
                0.35,
                Math.min(3.5, (Math.abs(transform.scaleX) + Math.abs(transform.scaleY)) / 2),
              );
              const signX = Math.sign(transform.scaleX) || 1;
              const signY = Math.sign(transform.scaleY) || 1;
              return (
                <div
                  key={`hit-motion-${motion.id}`}
                  className="pointer-events-auto absolute"
                  style={{
                    position: "absolute",
                    left: `${transform.x}%`,
                    top: `${transform.y}%`,
                    transform: isCta
                      ? `translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${transform.scaleX}, ${transform.scaleY})`
                      : `translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${signX * uniform}, ${signY * uniform})`,
                    transformOrigin: "center center",
                    width: isCta ? "max-content" : `${boxWidthPct}%`,
                    maxWidth: isCta ? "85%" : undefined,
                    zIndex: selected ? 25 : Math.max(5, transform.zIndex || 0),
                    overflow: "visible",
                  }}
                  data-transform-frame
                  onClick={(e) => {
                    e.stopPropagation();
                    selectItem(motion.id);
                  }}
                >
                  {/* Invisible chrome sized like Remotion overlays for accurate hit testing. */}
                  {isCta && ctaChrome ? (
                    <span
                      aria-hidden
                      className="invisible"
                      style={ctaChrome.badge as CSSProperties}
                    >
                      <span style={ctaChrome.dot as CSSProperties} />
                      {motion.label || "Subscribe"}
                    </span>
                  ) : chapterChrome ? (
                    <span
                      aria-hidden
                      className="invisible block w-full"
                      style={{
                        ...(chapterChrome as CSSProperties),
                        maxWidth: "100%",
                        width: "100%",
                        boxSizing: "border-box",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {motion.label || (chapterVariant === "lower-third" ? "Title" : "Chapter")}
                    </span>
                  ) : (
                    <div className="min-h-[2.5rem] min-w-[8rem]" aria-hidden />
                  )}
                  {selected ? (
                    <>
                      <TransformHandles
                        mode={isCta ? "media" : "text"}
                        transform={transform}
                        boxWidthPct={boxWidthPct}
                        onBoxWidthChange={
                          isCta
                            ? undefined
                            : (next) => updateAnimationItem(motion.id, { boxWidthPct: next })
                        }
                        onChange={(next) => {
                          if (isCta) {
                            updateItemTransform(motion.id, next);
                            return;
                          }
                          const sx = Math.sign(next.scaleX) || 1;
                          const sy = Math.sign(next.scaleY) || 1;
                          const u = Math.max(
                            0.35,
                            Math.min(3.5, (Math.abs(next.scaleX) + Math.abs(next.scaleY)) / 2),
                          );
                          updateItemTransform(motion.id, {
                            ...next,
                            scaleX: sx * u,
                            scaleY: sy * u,
                          });
                        }}
                      />
                      <CanvasElementToolbar variant={isCta ? "media" : "text"} />
                    </>
                  ) : null}
                </div>
              );
            })}
          </>
        ) : null}
        </div>

        {remotionManifestError ? (
          <div
            className="pointer-events-none absolute bottom-2.5 left-2.5 z-30 inline-flex max-w-[min(100%,20rem)] items-start gap-1.5 rounded-md border border-red-500/30 bg-black/75 px-2 py-1.5 text-[10px] leading-snug text-red-100/90 backdrop-blur-sm"
            title={remotionManifestError}
          >
            <Info className="mt-0.5 size-3 shrink-0 text-red-400/90" aria-hidden />
            <span>
              <span className="font-semibold text-red-200/95">Remotion preview failed</span>
              <span className="text-zinc-400"> · </span>
              {remotionManifestError}
            </span>
          </div>
        ) : null}

        {previewApproxLabel && !remotionManifestError ? (
          <div
            className="pointer-events-none absolute bottom-2.5 left-2.5 z-30 inline-flex max-w-[min(100%,18rem)] items-start gap-1.5 rounded-md border border-amber-500/25 bg-black/70 px-2 py-1.5 text-[10px] leading-snug text-amber-100/90 backdrop-blur-sm"
            title="Live preview approximates export for these effects."
          >
            <Info className="mt-0.5 size-3 shrink-0 text-amber-400/90" aria-hidden />
            <span>
              <span className="font-semibold text-amber-200/95">Preview ≠ export</span>
              <span className="text-zinc-400"> · </span>
              {previewApproxLabel}
            </span>
          </div>
        ) : null}

        <IconButton
          className="pointer-events-auto absolute right-2.5 top-2.5 z-40 size-8 rounded-lg border border-white/10 bg-black/60 opacity-100 backdrop-blur-sm transition-opacity hover:bg-black/80"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          onClick={(e) => {
            e.stopPropagation();
            void toggleFullscreen();
          }}
        >
          {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </IconButton>
      </div>
      </div>

      {/* Canvas zoom HUD — reference-style bottom-right controls */}
      {showCanvasControls ? <div className="pointer-events-auto absolute bottom-3 right-3 z-40 flex items-center gap-0.5 rounded-xl border border-white/12 bg-[#1a1a1a]/92 px-1 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-md">
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-40"
          title="Zoom out"
          disabled={canvasZoomPct <= 50}
          onClick={() => setCanvasZoomPct((z) => Math.max(50, z - 10))}
        >
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          className="min-w-[2.75rem] rounded-md px-1 py-1 text-center font-mono text-[11px] tabular-nums text-zinc-200 hover:bg-white/10"
          title="Reset zoom"
          onClick={() => setCanvasZoomPct(100)}
        >
          {canvasZoomPct}%
        </button>
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-40"
          title="Zoom in"
          disabled={canvasZoomPct >= 150}
          onClick={() => setCanvasZoomPct((z) => Math.min(150, z + 10))}
        >
          <Plus className="size-3.5" />
        </button>
        <span className="mx-0.5 h-4 w-px bg-white/15" />
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10 hover:text-white"
          title="Fit to screen"
          onClick={() => setCanvasZoomPct(100)}
        >
          <Maximize2 className="size-3.5" />
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-lg hover:bg-white/10",
            canvasLocked ? "text-amber-300" : "text-zinc-300 hover:text-white",
          )}
          title={canvasLocked ? "Unlock canvas" : "Lock canvas"}
          onClick={() => setCanvasLocked((v) => !v)}
        >
          {canvasLocked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
        </button>
      </div> : null}
    </section>
  );
}
