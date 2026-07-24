"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useEditorStore } from "@/lib/editor/store";
import type { ClipItem } from "@/lib/editor/types";
import { mediaBoxStyle, resolveTransform } from "@/lib/editor/transform";
import { previewMotionStyle } from "@/lib/editor/preview-motion";
import { resolveMediaUrl } from "@/lib/editor/media-url";
import { TransformHandles } from "./transform-handles";
import { CanvasElementToolbar } from "./canvas-element-toolbar";
import { cn } from "@/lib/utils";

interface CanvasMediaLayerProps {
  clip: ClipItem;
  selected: boolean;
  onSelect: () => void;
  layerStyle?: CSSProperties;
  forceLocalMs?: number | null;
  /** Force silent video element (e.g. outgoing transition layer). */
  muteMediaAudio?: boolean;
  /** Theme grade applied to pixels only — not selection chrome. */
  gradeFilter?: string;
}

export function CanvasMediaLayer({
  clip,
  selected,
  onSelect,
  layerStyle,
  forceLocalMs = null,
  muteMediaAudio = false,
  gradeFilter,
}: CanvasMediaLayerProps) {
  const getAsset = useEditorStore((s) => s.getAsset);
  const playheadMs = useEditorStore((s) => s.ui.playheadMs);
  const isPlaying = useEditorStore((s) => s.ui.isPlaying);
  const playbackSpeed = useEditorStore((s) => s.ui.playbackSpeed);
  const updateItemTransform = useEditorStore((s) => s.updateItemTransform);
  const clipAudioVolume = useEditorStore((s) => s.timeline.settings.clipAudioVolume);
  const previewMuted = useEditorStore((s) => Boolean(s.timeline.settings.previewMuted));
  const videoElRef = useRef<HTMLVideoElement>(null);
  const wasPlayingRef = useRef(false);
  const asset = getAsset(clip.assetId);
  const isVideo = asset?.mediaType === "video";
  const mediaSrc = asset ? resolveMediaUrl(asset.url) : null;
  const poster =
    resolveMediaUrl(clip.thumbnailUrl || "") ||
    resolveMediaUrl(asset?.thumbnailUrl || "") ||
    undefined;
  const imageSrc =
    asset?.mediaType === "image" && asset.url
      ? resolveMediaUrl(asset.url)
      : poster || null;
  const transform = resolveTransform(clip.transform);
  // Export only supports cover|contain — treat "fill" as cover so preview matches render.
  const fitClass = clip.fitMode === "contain" ? "object-contain" : "object-cover";
  const motionStyle = previewMotionStyle(clip.animation, clip.startMs, clip.endMs, playheadMs);
  // Export strips clip audio — keep video silent unless user raises preview-only mix.
  const allowClipAudio = !muteMediaAudio && !clip.muted && !previewMuted && clipAudioVolume > 0;
  const clipLocalMs = forceLocalMs != null ? forceLocalMs : playheadMs - clip.startMs;
  const sourceOffsetSec = (clip.sourceStartMs ?? 0) / 1000;
  // Pre-warm: if the playhead is approaching this clip (within 3s), start buffering
  // so the scene transition doesn't stutter. Active clip uses preload=auto always.
  const isClipActive = clipLocalMs >= 0 && playheadMs < clip.endMs;
  const isApproaching = playheadMs >= clip.startMs - 3000 && playheadMs < clip.startMs;
  const preloadMode = (isClipActive || isApproaching) ? "auto" : "metadata";

  // Transport: start/stop video element (do not depend on playhead while playing).
  useEffect(() => {
    const video = videoElRef.current;
    if (!video || !isVideo) return;

    // Property-only mute — never bind JSX muted= (re-render fights unmute).
    video.muted = !isPlaying || !allowClipAudio;
    video.volume = allowClipAudio ? Math.max(0, Math.min(1, clipAudioVolume / 100)) : 0;

    if (!isPlaying) {
      wasPlayingRef.current = false;
      video.pause();
      return;
    }

    video.playbackRate = playbackSpeed;
    const justStarted = !wasPlayingRef.current;
    wasPlayingRef.current = true;
    if (justStarted) {
      const ph = useEditorStore.getState().ui.playheadMs;
      const local = Math.max(0, ph - clip.startMs);
      const targetSec = Math.max(0, sourceOffsetSec + local / 1000);
      // Only pause-seek if the video isn't already close to the target.
      // This avoids a visible freeze when the playhead crosses into a clip that
      // was pre-warmed and is already playing/buffered.
      if (Math.abs(video.currentTime - targetSec) > 0.3) {
        try {
          if (!video.paused) video.pause();
          video.currentTime = targetSec;
        } catch {
          /* ignore */
        }
      }
    }
    if (video.paused) {
      void video.play().catch(() => undefined);
    }
  }, [
    allowClipAudio,
    clipAudioVolume,
    clip.id,
    clip.startMs,
    isPlaying,
    isVideo,
    mediaSrc,
    playbackSpeed,
    sourceOffsetSec,
  ]);

  // Scrub when paused + drift-correct when playing.
  useEffect(() => {
    const video = videoElRef.current;
    if (!video || !isVideo) return;
    const targetSec = Math.max(0, sourceOffsetSec + Math.max(0, clipLocalMs) / 1000);
    if (!isPlaying) {
      if (Math.abs(video.currentTime - targetSec) > 0.12) {
        try {
          video.currentTime = targetSec;
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (video.paused) return;
    // Never seek backward while playing — same repeat/stutter as narration audio.
    // Only catch forward when the element lags the playhead.
    if (targetSec - video.currentTime > 0.55) {
      try {
        video.currentTime = targetSec;
      } catch {
        /* ignore */
      }
    }
  }, [clipLocalMs, isPlaying, isVideo, sourceOffsetSec]);

  useEffect(() => {
    return () => {
      const video = videoElRef.current;
      if (!video) return;
      video.pause();
      video.muted = true;
      video.volume = 0;
    };
  }, [mediaSrc, clip.id]);

  return (
    <div
      className={cn(
        "pointer-events-auto absolute touch-none",
        // Overflow visible when selected so floating toolbar + handles aren’t clipped.
        selected ? "z-[25] overflow-visible" : "z-[1] overflow-hidden rounded-[2px]",
      )}
      style={{ ...mediaBoxStyle(transform), ...layerStyle }}
      data-transform-frame
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div
        className="h-full w-full overflow-hidden rounded-[2px]"
        style={{ ...motionStyle, filter: gradeFilter || undefined }}
      >
        {isVideo && mediaSrc ? (
          <video
            ref={videoElRef}
            src={mediaSrc}
            poster={poster || undefined}
            className={cn("h-full w-full", fitClass)}
            playsInline
            preload={preloadMode}
            draggable={false}
          />
        ) : imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt=""
            className={cn("h-full w-full", fitClass)}
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-xs text-zinc-500">
            No media
          </div>
        )}
      </div>

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
}
