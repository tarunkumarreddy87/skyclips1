"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Info, Loader2, Maximize2, Minimize2, Scan } from "lucide-react";
import {
  chapterTitleChromeStyle,
  getTheme,
  getTemplateMeta,
  overlayChromeFromPalette,
  resolveChapterVariant,
  subscribeCtaChromeStyle,
} from "@hanuman/shared-types";
import { useTemplateLayerSelection } from "@/lib/editor/template-layer-selection";
import { useEditorStore } from "@/lib/editor/store";
import type { AnimationItem, AudioItem, ClipItem, TextItem } from "@/lib/editor/types";
import { NativeTextEditor } from "../canvas/native-text-editor";
import { TransformHandles } from "../canvas/transform-handles";
import { AgentPreviewActivity } from "../canvas/agent-preview-activity";
import { CanvasElementToolbar } from "../canvas/canvas-element-toolbar";
import { IconButton } from "./icon-button";
import { PreviewPlayerControls } from "./preview-player-controls";
import { resolveMediaUrl } from "@/lib/editor/media-url";
import { mediaBoxStyle, resolveTransform } from "@/lib/editor/transform";
import { ensureEditorTextFontsLoaded } from "@/lib/editor/text-fonts";
import { findActiveTransitionScrub } from "@/lib/editor/preview-transition";
import { fadedGain } from "@/lib/editor/audio-fade";
import {
  stopPreviewAudio,
  syncPreviewAudio,
  warmPreviewAudioUrls,
} from "@/lib/editor/preview-audio-transport";
import {
  buildTimelineManifestV1FromEditorState,
} from "@/lib/editor/build-timeline-manifest";
import { isVideoEnginePreviewEnabled } from "@/lib/editor/preview-engine";
import { cn } from "@/lib/utils";
import { applyKeyframes, evaluateAnimation } from "@hanuman/video-engine";
import { useFitStageSize } from "@/lib/editor/use-fit-stage-size";

const VideoEnginePreview = dynamic(
  () =>
    import("../canvas/video-engine-preview").then((m) => m.VideoEnginePreview),
  { ssr: false },
);

function isMotionGraphicPreset(preset: string): boolean {
  const meta = getTemplateMeta(preset);
  return Boolean(meta && ["vertical_bar_chart", "line_chart", "before_after_split", "news_highlight", "doc_callout", "highlight_quote", "product_launch_fullscreen"].includes(meta.manifestType));
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
  const proxyProgress = useEditorStore((s) => s.ui.proxyProgress);
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
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("hanuman-editor-selection", { detail: { clipId: selectedItemId } }));
  }, [selectedItemId]);
  const transitions = useEditorStore((s) => s.timeline.transitions);
  const showTransitions = useEditorStore((s) => s.timeline.settings.showTransitions);
  const selectItem = useEditorStore((s) => s.selectItem);
  const setRightPanelOpen = useEditorStore((s) => s.setRightPanelOpen);
  const updateItemTransform = useEditorStore((s) => s.updateItemTransform);
  const updateTextItem = useEditorStore((s) => s.updateTextItem);
  const updateAnimationItem = useEditorStore((s) => s.updateAnimationItem);
  const updateGraphic = useEditorStore((s) => s.updateGraphic);
  const getAsset = useEditorStore((s) => s.getAsset);
  const captionStyle = useEditorStore((s) => s.timeline.settings.captionStyle);
  const clipAudioVolume = useEditorStore((s) => s.timeline.settings.clipAudioVolume);
  const assets = useEditorStore((s) => s.assets);
  const durationMs = useEditorStore((s) => s.timeline.durationMs);
  const enginePreview = isVideoEnginePreviewEnabled();
  const theme = useMemo(() => getTheme(themeId), [themeId]);
  const overlayChrome = useMemo(
    () =>
      overlayChromeFromPalette(theme.palette, {
        chapterFontSize: theme.chapterFontSize,
        ctaFontSize: theme.ctaFontSize,
      }),
    [theme],
  );

  useEffect(() => {
    ensureEditorTextFontsLoaded();
  }, []);

  const arollFillDoneRef = useRef<string | null>(null);
  const repairArollFullFrameSilent = useEditorStore((s) => s.repairArollFullFrameSilent);

  // Once per project load: heal corrupt A-roll transforms only.
  // Do NOT auto-fill timeline gaps — empty time must preview as black (NLE truth).
  useEffect(() => {
    if (!enginePreview) return;
    const projectId = useEditorStore.getState().project.id;
    if (arollFillDoneRef.current === projectId) return;
    const videoTrack = tracks.find((t) => t.type === "video");
    if (!videoTrack?.items.length) return;
    repairArollFullFrameSilent();
    arollFillDoneRef.current = projectId;
  }, [enginePreview, tracks, repairArollFullFrameSilent]);

  const engineBuild = useMemo(() => {
    if (!enginePreview) return { manifest: null as ReturnType<typeof buildTimelineManifestV1FromEditorState> | null, error: null as string | null };
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
        error: err instanceof Error ? err.message : "Could not build video engine preview manifest",
      };
    }
  }, [
    enginePreview,
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
    backgroundColor,
    backgroundImage,
    overlayDropShadow,
  ]);
  const engineManifest = engineBuild.manifest;
  const engineManifestError = engineBuild.error;

  const frameRef = useRef<HTMLDivElement>(null);
  const playerHostRef = useRef<HTMLElement>(null);
  const fullscreenTriggerRef = useRef<HTMLElement | null>(null);
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
  const [canvasZoomPct] = useState(100);
  const [canvasLocked] = useState(false);
  const [showSafeAreas, setShowSafeAreas] = useState(false);
  const templateLayer = useTemplateLayerSelection();
  const viewing = isFullscreen || isPlaying;

  // Exact 16:9 fit — CSS aspect-ratio + max-height was squashing the stage (~3:1).
  const fitSize = useFitStageSize(stageHostRef, 16 / 9, 0);
  const previewScale = isFullscreen ? 1 : canvasZoomPct / 100;
  const stageWidth = Math.max(0, Math.round(fitSize.width * previewScale));
  const stageHeight = Math.max(0, Math.round(fitSize.height * previewScale));

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
    // Duck under narration (matches video engine MUSIC_DUCK_UNDER_NARRATION ≈ 0.22).
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
    // One caption at a time — shortest window wins (matches video engine resolveCaptionOverlapWindows).
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

  const closeFullscreen = useCallback(() => {
    if (document.fullscreenElement === playerHostRef.current) {
      void document.exitFullscreen().catch(() => setIsFullscreen(false));
    } else {
      setIsFullscreen(false);
      fullscreenTriggerRef.current?.focus();
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = playerHostRef.current;
    if (!el) return;
    if (isFullscreen) { closeFullscreen(); return; }
    fullscreenTriggerRef.current = document.activeElement as HTMLElement | null;
    selectItem(null);
    setIsFullscreen(true);
    el.focus();
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      // Unsupported devices retain an in-page, fixed player with the same controls.
    } catch {
      // Keep expanded player mode; browser denied native fullscreen.
    }
  }, [isFullscreen, closeFullscreen, selectItem]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
        fullscreenTriggerRef.current?.focus();
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // --- Narration / music / sfx transport -------------------------------------
  // HTML audio buses follow the editor clock and gate it during narration buffering.
  // IMPORTANT: these effects must NOT depend on `playheadMs`. The playhead changes
  // ~30x/sec during playback, and depending on it caused the audio to be re-seeked
  // and replayed every frame ("voice repeating / stuttering"). The transport reads
  // the current playhead via getState() only when a clip/speed/volume actually changes.
  // Drift correction runs on a coarse interval below, never per-frame.

  // Narration — always editor clock (matches timeline playhead + video engine editorClock preview).
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
  }, [enginePreview, activeNarration?.id, isPlaying, narrationSrc, playbackSpeed, narrationVolume, previewMuted]);

  // Live volume / fade curve while playing (no transport restart).
  useEffect(() => {
    const audio = narrationRef.current;
    if (!audio || !isPlaying) return;
    audio.volume = Math.max(0, Math.min(1, narrationGain));
    audio.muted = narrationGain <= 0.0001;
  }, [enginePreview, isPlaying, narrationGain]);

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
  }, [enginePreview, activeMusic?.id, isPlaying, musicSrc, playbackSpeed, musicVolume, previewMuted, activeNarration?.id]);

  useEffect(() => {
    const audio = musicRef.current;
    if (!audio || !isPlaying) return;
    audio.volume = Math.max(0, Math.min(1, musicGain));
    audio.muted = musicGain <= 0.0001;
  }, [enginePreview, isPlaying, musicGain]);

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
  }, [enginePreview, activeSfx?.id, isPlaying, sfxSrc, playbackSpeed, sfxVolume, previewMuted]);

  useEffect(() => {
    const audio = sfxRef.current;
    if (!audio || !isPlaying) return;
    audio.volume = Math.max(0, Math.min(1, sfxGain));
    audio.muted = sfxGain <= 0.0001;
  }, [enginePreview, isPlaying, sfxGain]);

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
  }, [enginePreview, tracks, assets, getAsset, activeNarration?.id]);

  useEffect(() => {
    return () => {
      stopPreviewAudio(narrationRef.current);
      stopPreviewAudio(musicRef.current);
      stopPreviewAudio(sfxRef.current);
    };
  }, []);

  return (
    <section
      ref={playerHostRef}
      tabIndex={-1}
      aria-label="Video preview player"
      data-preview-player={isFullscreen ? "expanded" : "inline"}
      data-preview-mode={viewing ? "playback" : "edit"}
      className={cn(
        "relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden outline-none",
        isFullscreen && "!fixed inset-0 z-[400] !h-dvh !w-screen bg-black [&_[data-transform-frame]]:!pointer-events-none [&_[contenteditable]]:!pointer-events-none [&_[data-element-toolbar]]:hidden",
      )}
      style={{
        backgroundColor: isFullscreen ? "#000" : "#111214",
      }}
    >
      <div
        ref={stageHostRef}
        data-preview-viewport
        className={cn("relative flex min-h-0 min-w-0 flex-1 items-center justify-center", isFullscreen ? "p-0" : "px-5 pb-6 pt-12 sm:px-10")}
      >
        {!isFullscreen && <>
          {!selectedItemId && <span className="pointer-events-none absolute left-4 top-4 text-[10px] font-medium tracking-wider text-zinc-500">PREVIEW <span className="ml-2 font-normal tracking-normal text-zinc-600">16:9</span></span>}
          <button type="button" title="Editing guides only: inner line keeps titles safe; outer line keeps action safe. Never included in your video." aria-label="Show alignment guides" aria-pressed={showSafeAreas}
            onClick={() => setShowSafeAreas(value => !value)}
            className={cn("absolute bottom-1 right-3 z-40 flex h-5 items-center gap-1.5 rounded px-1.5 text-[10px] transition-colors focus-visible:outline-2 focus-visible:outline-sky-400", showSafeAreas ? "bg-white/10 text-zinc-200" : "text-zinc-500 hover:text-zinc-200")}>
            <Scan className="size-3" /> Guides
          </button>
          <span className="pointer-events-none absolute bottom-1 left-4 text-[10px] tabular-nums text-zinc-600">Fit · {Math.round(stageWidth / 1920 * 100)}%</span>
        </>}
        <div
          ref={frameRef}
          data-preview-stage
          className={cn(
            "group/frame relative shrink-0 overflow-visible rounded-none border border-white/12 bg-black",
            "shadow-[0_2px_12px_rgba(0,0,0,0.12)]",
            stageWidth < 8 && "opacity-0",
            isFullscreen && "!border-0 !shadow-none [&_[data-element-toolbar]]:hidden [&_[data-template-layer-controls]]:hidden [&_[data-layer-id]]:!pointer-events-none",
            canvasLocked && !isFullscreen && "[&_[data-transform-frame]]:!pointer-events-none [&_[contenteditable]]:!pointer-events-none [&_[data-element-toolbar]]:hidden",
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
            // Resize synchronously so edge controls never trail the timeline divider.
            transition: "none",
          }}
          onClick={(e) => {
            if (viewing) return;
            if ((e.target as HTMLElement).closest("[data-transform-frame]")) return;
            selectItem(null);
          }}
        >
        <div
          className="absolute inset-0 overflow-visible"
          style={enginePreview ? { pointerEvents: "none" } : undefined}
        >
        {/* Clip picture only — selection chrome (toolbar / rotate) can paint outside. */}
        <div inert={viewing} className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <div
          className="absolute inset-0"
          style={enginePreview ? { pointerEvents: "none" } : undefined}
        >
        <audio ref={narrationRef} preload="auto" playsInline />
        <audio ref={musicRef} preload="auto" playsInline />
        <audio ref={sfxRef} preload="auto" playsInline />

        {enginePreview && engineManifest ? (
          <VideoEnginePreview manifest={engineManifest} />
        ) : null}

        </div>
        </div>

        {/* video engine preview: hit targets so media/text can be selected & dragged. */}
        {enginePreview && engineManifest ? (
          <>
            {[...previewVideoClips, ...activeBrollClips].map((clip) => {
              // The HTML scene performs per-element hit testing. A full-clip
              // invisible target here would intercept every headline/object click.
              if (clip.motionTemplate) {
                if (selectedItemId !== clip.id || (templateLayer.clipId === clip.id && templateLayer.layer)) return null;
                const templateTransform = resolveTransform(clip.transform);
                return <div key={`template-frame-${clip.id}`} data-transform-frame
                  className="pointer-events-none absolute"
                  style={{ ...mediaBoxStyle(templateTransform), zIndex: 20, outline: "1px solid rgba(167,139,250,0.95)" }}>
                  <TransformHandles transform={templateTransform}
                    onChange={next => updateItemTransform(clip.id, next)} />
                  <CanvasElementToolbar />
                </div>;
              }
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
                    zIndex: Math.min(19, Math.max(4, transform.zIndex || 0)),
                    outline: selected ? "1px solid rgba(255,255,255,0.9)" : undefined,
                  }}
                  data-transform-frame
                  onPointerDown={(e) => {
                    e.preventDefault();
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

            {visibleOverlays.map((overlay) => (
              <NativeTextEditor key={overlay.id} item={overlay} selected={selectedItemId === overlay.id} />
            ))}

            {visibleMotion.map((motion) => {
              if (motion.graphic) {
                const graphic = engineManifest?.graphics?.find((object) => object.id === motion.id) ?? motion.graphic;
                const clockMs = useEditorStore.getState().ui.previewScrubMs ?? playheadMs;
                const animated = applyKeyframes(
                  evaluateAnimation(graphic.transform, graphic.animation, clockMs / 1000 - graphic.start_sec, graphic.duration_sec),
                  graphic.keyframes, clockMs / 1000 - graphic.start_sec,
                );
                const transform = {
                  x: animated.x + animated.offsetX / 1920 * 100,
                  y: animated.y + animated.offsetY / 1080 * 100,
                  scaleX: animated.scaleX, scaleY: animated.scaleY,
                  rotation: animated.rotation, zIndex: animated.zIndex,
                };
                const selected = selectedItemId === motion.id;
                return <div key={`hit-graphic-${motion.id}`} data-transform-frame
                  className="pointer-events-auto absolute touch-none"
                  style={{
                    left: `${transform.x}%`, top: `${transform.y}%`,
                    width: `${graphic.width_pct ?? (graphic.type === "bar_chart" ? 55 : 38)}%`,
                    height: `${graphic.height_pct ?? (graphic.type === "bar_chart" ? 54 : 44)}%`,
                    transform: `translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${transform.scaleX}, ${transform.scaleY})`,
                    zIndex: selected ? 35 : Math.max(15, transform.zIndex),
                    outline: selected ? "1px solid rgba(255,255,255,0.9)" : undefined,
                  }}
                  onPointerDown={(event) => { event.stopPropagation(); selectItem(motion.id); }}
                  onClick={(event) => { event.stopPropagation(); selectItem(motion.id); }}>
                  {selected ? <>
                    <TransformHandles transform={transform} onChange={(next) => {
                      // Move the entire authored path when dragging an animated object.
                      const base = resolveTransform(motion.transform, motion.position);
                      const dx = next.x - transform.x; const dy = next.y - transform.y;
                      updateGraphic(motion.id, {
                        transform: { ...base, x: base.x + dx, y: base.y + dy,
                          scaleX: base.scaleX * next.scaleX / (transform.scaleX || 1),
                          scaleY: base.scaleY * next.scaleY / (transform.scaleY || 1),
                          rotation: base.rotation + next.rotation - transform.rotation },
                        keyframes: motion.graphic!.keyframes?.map((key) => ({ ...key,
                          ...(key.x != null ? { x: key.x + dx } : {}), ...(key.y != null ? { y: key.y + dy } : {}),
                          ...(key.rotation != null ? { rotation: key.rotation + next.rotation - transform.rotation } : {}),
                        })),
                      });
                    }} />
                    <CanvasElementToolbar />
                  </> : null}
                </div>;
              }
              const transform = resolveTransform(motion.transform, motion.position);
              const selected = selectedItemId === motion.id;
              const isCta = motion.preset === "subscribe-cta";
              const isGraphic = isMotionGraphicPreset(motion.preset);
              const chapterVariant = resolveChapterVariant(
                motion.preset === "lower-third" ? "lower-third" : "chapter",
                transform.y,
              );
              const ctaChrome = isCta
                ? subscribeCtaChromeStyle(overlayChrome, { previewScale: true })
                : null;
              const chapterChrome = !isCta && !isGraphic
                ? chapterTitleChromeStyle(chapterVariant, overlayChrome, { previewScale: true })
                : null;
              const boxWidthPct = Math.max(18, Math.min(92, motion.boxWidthPct ?? (isGraphic ? 72 : 70)));
              const uniform = Math.max(
                0.35,
                Math.min(3.5, (Math.abs(transform.scaleX) + Math.abs(transform.scaleY)) / 2),
              );
              const signX = Math.sign(transform.scaleX) || 1;
              const signY = Math.sign(transform.scaleY) || 1;
              return (
                <div
                  key={`hit-motion-${motion.id}`}
                  onDoubleClick={(e) => { e.stopPropagation(); selectItem(motion.id); useEditorStore.getState().setActiveTool("text"); }}
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
                    zIndex: selected ? 25 : Math.max(isGraphic ? 25 : 5, transform.zIndex || 0),
                    overflow: "visible",
                  }}
                  data-transform-frame
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); selectItem(motion.id); }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectItem(motion.id);
                  }}
                >
                  {/* Invisible chrome sized like video engine overlays for accurate hit testing. */}
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

        {!viewing && templateLayer.clipId === selectedItemId && templateLayer.layer && <CanvasElementToolbar templateLayerId={templateLayer.layer.id} variant={templateLayer.layer.id === "title" || templateLayer.layer.id === "subtitle" ? "text" : "media"} />}
        <style>{`[data-preview-stage] [data-template-layer-controls] > button:not([data-resize]), [data-preview-mode="playback"] [data-template-layer-controls], [data-preview-mode="playback"] [data-element-toolbar] { display: none !important; }`}</style>

        {engineManifestError ? (
          <div
            className="pointer-events-none absolute bottom-2.5 left-2.5 z-30 inline-flex max-w-[min(100%,20rem)] items-start gap-1.5 rounded-md border border-red-500/30 bg-black/75 px-2 py-1.5 text-[10px] leading-snug text-red-100/90 backdrop-blur-sm"
            title={engineManifestError}
          >
            <Info className="mt-0.5 size-3 shrink-0 text-red-400/90" aria-hidden />
            <span>
              <span className="font-semibold text-red-200/95">video engine preview failed</span>
              <span className="text-zinc-400"> · </span>
              {engineManifestError}
            </span>
          </div>
        ) : null}

        {proxyProgress ? (
          <div
            className="pointer-events-none absolute bottom-3 right-3 z-30 inline-flex items-center gap-2 rounded-full border border-sky-500/25 bg-black/85 px-3 py-1.5 text-xs text-zinc-300 shadow-xl backdrop-blur-md"
            title="Optimizing playback in the background. Editing and preview playback are fully active."
          >
            <Loader2 className="size-3.5 animate-spin text-sky-400" aria-hidden />
            <span>Optimizing playback</span>
            <span className="font-mono tabular-nums text-sky-400">
              {proxyProgress.ready}/{proxyProgress.total}
            </span>
          </div>
        ) : null}



        {!viewing && <AgentPreviewActivity />}
        {showSafeAreas && !viewing && <div aria-hidden data-preview-safe-areas className="pointer-events-none absolute inset-0 z-30">
          <div className="absolute inset-[5%] border border-white/35" />
          <div className="absolute inset-[10%] border border-dashed border-white/35" />
          <div className="absolute left-1/2 top-1/2 h-3 w-px -translate-y-1/2 bg-white/40" />
          <div className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 bg-white/40" />
        </div>}
        {viewing && <div data-preview-playback-surface role="button" tabIndex={0}
          aria-label={isPlaying ? "Pause video" : "Play video"}
          className="absolute inset-0 z-[60] cursor-default outline-none"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); useEditorStore.getState().setPlaying(!useEditorStore.getState().ui.isPlaying); }}
          onKeyDown={event => { if (event.key === "Enter" || event.code === "Space") { event.preventDefault(); event.stopPropagation(); useEditorStore.getState().setPlaying(!useEditorStore.getState().ui.isPlaying); } }} />}
        <IconButton
          className="pointer-events-auto absolute right-2.5 top-2.5 z-[70] !size-7 rounded-lg border border-white/10 bg-black/60 opacity-100 backdrop-blur-sm transition-opacity hover:bg-black/80"
          data-preview-fullscreen-toggle
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          onClick={(e) => {
            e.stopPropagation();
            void toggleFullscreen();
          }}
        >
          {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </IconButton>
      </div>
      </div>





      {isFullscreen ? <PreviewPlayerControls onClose={closeFullscreen} /> : null}

    </section>
  );
}
