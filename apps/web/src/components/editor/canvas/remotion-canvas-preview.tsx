"use client";

/**
 * Remotion Player canvas for editor preview (ADR 0009).
 * Uses editorClock layout so playhead ↔ picture match the timeline lanes.
 * HTML narration/music/sfx stays SSOT (muteAudio); A-roll clip audio is
 * preview-only via Html5Video volume when clip_audio_volume > 0.
 *
 * Playback clock: while playing, Remotion Player is the SSOT for playhead
 * (frameupdate → store). Editor RAF must not also advance playhead or the
 * two clocks desync and picture looks stuck.
 */

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import {
  TimelineComposition,
  type TimelineManifestV1,
} from "@hanuman/remotion-renderer/preview";
import {
  isPreviewAudioGateBlocked,
  subscribePreviewAudioGate,
} from "@/lib/editor/preview-audio-transport";
import { useEditorStore } from "@/lib/editor/store";

export interface RemotionCanvasPreviewProps {
  /** Built with srcMode: "browser" — cast to Remotion TimelineManifestV1. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  manifest: TimelineManifestV1 | Record<string, any>;
  className?: string;
}

/** Linear editor playhead → frame (matches timeline scrubber / caption lanes). */
function frameFromPlayhead(playheadMs: number, fps: number, durationInFrames: number) {
  return Math.max(0, Math.min(durationInFrames - 1, Math.round((playheadMs / 1000) * fps)));
}

function editorDurationFrames(manifest: TimelineManifestV1, fps: number): number {
  const meta = Math.max(0.001, Number(manifest.metadata?.duration_sec) || 0);
  let maxEnd = meta;
  for (const clip of manifest.tracks?.video ?? []) {
    maxEnd = Math.max(maxEnd, clip.start_sec + clip.duration_sec);
  }
  for (const clip of manifest.tracks?.broll ?? []) {
    maxEnd = Math.max(maxEnd, clip.start_sec + clip.duration_sec);
  }
  for (const clip of manifest.tracks?.captions ?? []) {
    maxEnd = Math.max(maxEnd, clip.start_sec + clip.duration_sec);
  }
  for (const overlay of manifest.overlays ?? []) {
    maxEnd = Math.max(maxEnd, overlay.start_sec + overlay.duration_sec);
  }
  return Math.max(1, Math.round(maxEnd * fps));
}

/**
 * Structural timeline identity — excludes transforms/labels so drag-resizes
 * update picture via inputProps without forcing a Remotion seek reset.
 */
function structuralManifestKey(manifest: TimelineManifestV1): string {
  const clipKey = (clips: { id: string; start_sec: number; duration_sec: number; src?: string }[]) =>
    clips
      .map((c) => `${c.id}:${c.start_sec.toFixed(3)}:${c.duration_sec.toFixed(3)}:${c.src ?? ""}`)
      .join("|");
  const tr = (manifest.transitions ?? [])
    .map((t) => `${t.id}:${t.after_clip_id}:${t.type}:${t.duration_sec}`)
    .join("|");
  const ov = (manifest.overlays ?? [])
    .map((o) => `${o.id}:${o.start_sec}:${o.duration_sec}:${o.type}`)
    .join("|");
  return [
    manifest.metadata?.duration_sec,
    manifest.metadata?.fps,
    manifest.settings?.theme_id,
    manifest.settings?.caption_style,
    manifest.settings?.captions_enabled,
    clipKey(manifest.tracks?.video ?? []),
    clipKey(manifest.tracks?.broll ?? []),
    clipKey(
      (manifest.tracks?.captions ?? []).map((c) => ({
        id: c.id,
        start_sec: c.start_sec,
        duration_sec: c.duration_sec,
        src: c.text,
      })),
    ),
    clipKey(
      (manifest.tracks?.audio ?? []).map((a) => ({
        id: a.id,
        start_sec: a.start_sec,
        duration_sec: a.duration_sec,
        src: a.src,
      })),
    ),
    clipKey(
      (manifest.tracks?.music ?? []).map((m) => ({
        id: m.id,
        start_sec: m.start_sec,
        duration_sec: m.duration_sec,
        src: m.src,
      })),
    ),
    tr,
    ov,
  ].join("::");
}

function RemotionCanvasPreviewInner({
  manifest: manifestProp,
  className,
}: RemotionCanvasPreviewProps) {
  const manifest = manifestProp as TimelineManifestV1;
  const playheadMs = useEditorStore((s) => s.ui.playheadMs);
  const previewScrubMs = useEditorStore((s) => s.ui.previewScrubMs);
  const isPlaying = useEditorStore((s) => s.ui.isPlaying);
  const playbackSpeed = useEditorStore((s) => s.ui.playbackSpeed);
  const playerRef = useRef<PlayerRef | null>(null);
  const lastFrameRef = useRef<number>(-1);
  const pendingFrameRef = useRef<number | null>(null);
  const playingRef = useRef(false);
  const lastStoreWriteRef = useRef(0);
  const fps = manifest.metadata.fps || 30;
  const durationInFrames = useMemo(
    () => editorDurationFrames(manifest, fps),
    [manifest, fps],
  );
  const structureKey = useMemo(() => structuralManifestKey(manifest), [manifest]);
  const width = manifest.metadata.resolution?.width ?? 1920;
  const height = manifest.metadata.resolution?.height ?? 1080;
  const clockMs = previewScrubMs ?? playheadMs;
  const initialFrame = frameFromPlayhead(clockMs, fps, durationInFrames);
  const previewMuted = useEditorStore((s) => Boolean(s.timeline.settings.previewMuted));
  const clipAudioOn =
    !previewMuted && (manifest.settings?.clip_audio_volume ?? 0) > 0.001;

  const inputProps = useMemo(
    () => ({
      manifest,
      muteAudio: true as const,
      editorClock: true as const,
    }),
    [manifest],
  );

  // Prefetch the next few A-roll / B-roll URLs so scene cuts aren't a cold S3 start.
  useEffect(() => {
    const urls: string[] = [];
    const push = (src?: string) => {
      if (!src || src.startsWith("color:") || !/^https?:/i.test(src)) return;
      if (!urls.includes(src)) urls.push(src);
    };
    for (const c of manifest.tracks?.video ?? []) push(c.src);
    for (const c of manifest.tracks?.broll ?? []) push(c.src);
    const nowSec = (useEditorStore.getState().ui.playheadMs || 0) / 1000;
    const upcoming = [
      ...(manifest.tracks?.video ?? []),
      ...(manifest.tracks?.broll ?? []),
    ]
      .filter((c) => c.start_sec >= nowSec - 1 && c.start_sec <= nowSec + 25)
      .slice(0, 4);
    const warm = upcoming.length
      ? upcoming.map((c) => c.src).filter(Boolean)
      : urls.slice(0, 3);
    for (const src of warm) {
      if (!src || !/^https?:/i.test(src)) continue;
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;
      v.src = src;
      // Hint the browser; element is GC'd after leaving this effect scope via Weak... 
      // Keep a short-lived pool on window to retain the network buffer.
      const pool = ((window as unknown as { __skyclipWarmVideos?: HTMLVideoElement[] })
        .__skyclipWarmVideos ??= []);
      pool.push(v);
      while (pool.length > 6) {
        const old = pool.shift();
        if (old) {
          old.removeAttribute("src");
          try {
            old.load();
          } catch {
            /* ignore */
          }
        }
      }
    }
  }, [structureKey, manifest]);

  const seekToFrame = useCallback(
    (frame: number, opts?: { force?: boolean }) => {
      if (!opts?.force && frame === lastFrameRef.current) return;
      const player = playerRef.current;
      if (!player) {
        pendingFrameRef.current = frame;
        return;
      }
      try {
        player.seekTo(frame);
        lastFrameRef.current = frame;
        pendingFrameRef.current = null;
      } catch {
        pendingFrameRef.current = frame;
      }
    },
    [],
  );

  const bindPlayerRef = useCallback(
    (player: PlayerRef | null) => {
      playerRef.current = player;
      if (!player) return;
      const pending = pendingFrameRef.current;
      const ph = useEditorStore.getState().ui;
      const ms = ph.previewScrubMs ?? ph.playheadMs;
      const frame =
        pending != null ? pending : frameFromPlayhead(ms, fps, durationInFrames);
      try {
        player.seekTo(frame);
        lastFrameRef.current = frame;
        pendingFrameRef.current = null;
      } catch {
        pendingFrameRef.current = frame;
      }
    },
    [fps, durationInFrames],
  );

  // Scrub / paused seek only — while playing, Remotion owns the clock.
  useEffect(() => {
    if (isPlaying && previewScrubMs == null) return;
    seekToFrame(frameFromPlayhead(clockMs, fps, durationInFrames));
  }, [clockMs, fps, durationInFrames, seekToFrame, isPlaying, previewScrubMs]);

  // Play / pause + drive store playhead from Player frames.
  useEffect(() => {
    playingRef.current = isPlaying;
    const player = playerRef.current;
    if (!player) return;

    if (!isPlaying) {
      try {
        player.pause();
      } catch {
        /* ignore */
      }
      return;
    }

    const ph = useEditorStore.getState().ui;
    seekToFrame(
      frameFromPlayhead(ph.previewScrubMs ?? ph.playheadMs, fps, durationInFrames),
      { force: true },
    );

    const resumeIfAllowed = () => {
      if (!playingRef.current || isPreviewAudioGateBlocked()) return;
      if (useEditorStore.getState().ui.previewScrubMs != null) return;
      try {
        if (!player.isPlaying()) player.play();
      } catch {
        /* ignore */
      }
    };

    resumeIfAllowed();

    const onFrame = () => {
      if (!playingRef.current) return;
      if (isPreviewAudioGateBlocked()) {
        try {
          if (player.isPlaying()) player.pause();
        } catch {
          /* ignore */
        }
        return;
      }
      const state = useEditorStore.getState();
      if (state.ui.previewScrubMs != null) return;

      let frame = 0;
      try {
        frame = player.getCurrentFrame();
      } catch {
        return;
      }
      lastFrameRef.current = frame;
      const ms = (frame / fps) * 1000;
      if (ms >= state.timeline.durationMs - 1) {
        state.setPlaying(false);
        state.setPlayhead(state.timeline.durationMs);
        try {
          player.pause();
        } catch {
          /* ignore */
        }
        return;
      }
      const now = performance.now();
      // ~30fps store writes — timeline + captions follow without flooding React.
      if (now - lastStoreWriteRef.current >= 33) {
        lastStoreWriteRef.current = now;
        state.setPlayhead(ms);
      }
    };

    player.addEventListener("frameupdate", onFrame);

    const unsubGate = subscribePreviewAudioGate(() => {
      if (!playingRef.current) return;
      if (isPreviewAudioGateBlocked()) {
        try {
          player.pause();
        } catch {
          /* ignore */
        }
      } else {
        resumeIfAllowed();
      }
    });

    const keepAlive = window.setInterval(() => {
      resumeIfAllowed();
    }, 500);

    return () => {
      player.removeEventListener("frameupdate", onFrame);
      unsubGate();
      window.clearInterval(keepAlive);
    };
  }, [isPlaying, fps, durationInFrames, seekToFrame]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (clipAudioOn) player.unmute();
      else player.mute();
    } catch {
      /* ignore */
    }
  }, [clipAudioOn]);

  // Force seek only when clip structure / duration changes — NOT on transform drags.
  useEffect(() => {
    lastFrameRef.current = -1;
    pendingFrameRef.current = null;
    const ph = useEditorStore.getState().ui;
    const frame = frameFromPlayhead(
      ph.previewScrubMs ?? ph.playheadMs,
      fps,
      durationInFrames,
    );
    const id = requestAnimationFrame(() => {
      seekToFrame(frame, { force: true });
      if (playingRef.current && !isPreviewAudioGateBlocked()) {
        try {
          playerRef.current?.play();
        } catch {
          /* ignore */
        }
      }
    });
    return () => cancelAnimationFrame(id);
  }, [structureKey, durationInFrames, fps, seekToFrame]);

  const errorFallback = useCallback(({ error }: { error: Error }) => {
    console.error("[remotion-preview]", error);
    return (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          background: "#000",
          color: "#fafafa",
          padding: 16,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600 }}>Preview failed to render</div>
        <div style={{ fontSize: 11, maxWidth: 360, color: "#a1a1aa", lineHeight: 1.4 }}>
          {error.message || "Unknown Remotion error"}
        </div>
      </div>
    );
  }, []);

  return (
    <div className={className} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <Player
        ref={bindPlayerRef}
        component={TimelineComposition}
        inputProps={inputProps}
        durationInFrames={durationInFrames}
        compositionWidth={width}
        compositionHeight={height}
        fps={fps}
        playbackRate={Math.max(0.25, Math.min(2, playbackSpeed || 1))}
        style={{ width: "100%", height: "100%" }}
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        initiallyMuted={!clipAudioOn}
        initialFrame={initialFrame}
        errorFallback={errorFallback}
        acknowledgeRemotionLicense
      />
    </div>
  );
}

/** Memoized on manifest — playhead subscription is internal. */
export const RemotionCanvasPreview = memo(RemotionCanvasPreviewInner);
