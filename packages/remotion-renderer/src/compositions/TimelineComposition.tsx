import React, { useMemo } from "react";
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import type { TimelineManifestV1, Transition, VideoClip } from "../lib/types";
import {
  clipDurationFrames,
  clipFromFrame,
  mapEditorIntervalToExport,
  secToFrameOffset,
  secToFrames,
} from "../lib/timing";
import {
  dualClipTransitionStyles,
  findActiveEditorTransition,
} from "../lib/editor-transition-styles";
import { audioVolumeAtFrame, MUSIC_DUCK_UNDER_NARRATION, narrationCoversSec } from "../lib/audio-volume";
import { getRemotionTheme, themeGradeCssFilter } from "../lib/theme-grade";
import { presentationForType } from "../transitions/map";
import { AnimatedMediaClip } from "../components/AnimatedMediaClip";
import { CaptionTrack, OverlayTrack } from "../components/CaptionsOverlays";

function transitionAfter(
  clipId: string,
  transitions: Transition[] | undefined,
): Transition | undefined {
  return (transitions ?? []).find(
    (t) => t.after_clip_id === clipId && t.enabled !== false && t.type !== "cut",
  );
}

function intervalOnClock(
  startSec: number,
  durationSec: number,
  manifest: TimelineManifestV1,
  editorClock: boolean,
): { startSec: number; durationSec: number } {
  if (editorClock) {
    return { startSec, durationSec: Math.max(1 / 30, durationSec) };
  }
  return mapEditorIntervalToExport(startSec, durationSec, manifest);
}

/**
 * Black plate when no A-roll covers this frame — kills frozen ghost A-roll pixels
 * in timeline gaps. Must sit *under* b-roll / captions / overlays so secondary
 * layers still paint in holes (RVE-style: empty scene track ≠ hide everything).
 */
const GapMask: React.FC<{ videos: VideoClip[]; enabled: boolean }> = ({ videos, enabled }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!enabled) return null;
  const nowSec = frame / fps;
  const hasVideo = videos.some(
    (v) => nowSec >= v.start_sec && nowSec < v.start_sec + v.duration_sec,
  );
  if (hasVideo) return null;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000",
        pointerEvents: "none",
      }}
    />
  );
};

/**
 * Absolute A-roll on the editor clock, with live dual-clip blends at transition windows
 * (TransitionSeries is export-only because it compresses time).
 */
const EditorClockVideoTrack: React.FC<{
  videos: VideoClip[];
  transitions: Transition[];
  clipAudioVolume: number;
}> = ({ videos, transitions, clipAudioVolume }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowSec = frame / fps;
  const active = findActiveEditorTransition(nowSec, videos, transitions);
  const fromClip = active ? videos.find((v) => v.id === active.fromId) : undefined;
  const toClip = active ? videos.find((v) => v.id === active.toId) : undefined;
  const dual =
    active && fromClip && toClip
      ? dualClipTransitionStyles(active.type, active.progress)
      : null;

  return (
    <>
      {videos.map((clip) => {
        const inBlend =
          active && dual && (clip.id === active.fromId || clip.id === active.toId);
        if (inBlend) return null;
        return (
          <Sequence
            key={clip.id}
            from={clipFromFrame(clip.start_sec, fps)}
            durationInFrames={clipDurationFrames(clip.duration_sec, fps)}
            name={clip.id}
            layout="none"
          >
            <AnimatedMediaClip
              clip={clip}
              preferHtml5Video
              clipAudioVolume={clipAudioVolume}
            />
          </Sequence>
        );
      })}
      {active && dual && fromClip && toClip ? (
        <AbsoluteFill style={{ zIndex: 5 }}>
          <Sequence
            from={clipFromFrame(fromClip.start_sec, fps)}
            durationInFrames={clipDurationFrames(fromClip.duration_sec, fps)}
            name={`tr-from-${fromClip.id}`}
            layout="none"
          >
            <AbsoluteFill style={dual.from}>
              {/* Outgoing layer silent — matches CSS preview muteMediaAudio. */}
              <AnimatedMediaClip clip={fromClip} preferHtml5Video clipAudioVolume={0} />
            </AbsoluteFill>
          </Sequence>
          <Sequence
            from={clipFromFrame(active.startSec, fps)}
            durationInFrames={secToFrames(active.durationSec, fps)}
            name={`tr-to-${toClip.id}`}
            layout="none"
          >
            <AbsoluteFill style={dual.to}>
              <AnimatedMediaClip
                clip={toClip}
                preferHtml5Video
                clipAudioVolume={clipAudioVolume}
              />
            </AbsoluteFill>
          </Sequence>
        </AbsoluteFill>
      ) : null}
    </>
  );
};

/**
 * VidRush-parity composition:
 * - Export: A-roll via TransitionSeries (overlap-aware) + secondary layers on export clock
 * - Editor preview (`editorClock`): absolute Sequence layout matching the timeline playhead
 *   + dual-clip transition blends at cut windows (no time compression)
 */
export const TimelineComposition: React.FC<{
  manifest: TimelineManifestV1;
  muteAudio?: boolean;
  editorClock?: boolean;
  /** Temporary: force theme grade CSS filter off for A/B timing. */
  disableThemeGrade?: boolean;
  /** Temporary: skip CaptionTrack. */
  disableCaptions?: boolean;
  /** Temporary: hard cuts only (no TransitionSeries.Transition). */
  disableTransitions?: boolean;
  /** Temporary: disable ParallaxPanClip path. */
  disableParallax?: boolean;
  /** Temporary: ApplyAnimation no-op. */
  disableAnimations?: boolean;
}> = ({
  manifest,
  muteAudio = false,
  editorClock = false,
  disableThemeGrade = false,
  disableCaptions = false,
  disableTransitions = false,
  disableParallax = false,
  disableAnimations = false,
}) => {
  const { fps } = useVideoConfig();
  const videos = [...manifest.tracks.video].sort((a, b) => a.start_sec - b.start_sec);
  const transitions = disableTransitions ? [] : (manifest.transitions ?? []);
  const broll = manifest.tracks.broll ?? [];
  const overlays = manifest.overlays ?? [];
  const captions = manifest.tracks.captions ?? [];
  const audio = manifest.tracks.audio ?? [];
  const music = manifest.tracks.music ?? [];
  const settings = manifest.settings;
  const theme = getRemotionTheme(settings?.theme_id);
  const gradeFilter = themeGradeCssFilter(settings?.theme_id, { disable: disableThemeGrade });
  const narrationBus = settings?.narration_volume ?? 1;
  const musicBus = settings?.music_volume ?? 1;
  const sfxBus = settings?.sfx_volume ?? 1;
  // Preview-only A-roll bus; export path always passes 0 via preferHtml5=false + muted.
  const clipAudioVolume = editorClock
    ? Math.max(0, Math.min(1, settings?.clip_audio_volume ?? 0))
    : 0;

  const seriesChildren = useMemo(() => {
    if (editorClock) return null;
    const nodes: React.ReactNode[] = [];
    videos.forEach((clip: VideoClip, i: number) => {
      const dur = clipDurationFrames(clip.duration_sec, fps);
      nodes.push(
        <TransitionSeries.Sequence key={`seq-${clip.id}`} durationInFrames={dur} name={clip.id}>
          <AnimatedMediaClip
            clip={clip}
            disableParallax={disableParallax}
            disableAnimations={disableAnimations}
          />
        </TransitionSeries.Sequence>,
      );
      if (i < videos.length - 1) {
        const tr = transitionAfter(clip.id, transitions);
        if (tr) {
          const presentation = presentationForType(tr.type);
          if (presentation) {
            nodes.push(
              <TransitionSeries.Transition
                key={`tr-${tr.id}`}
                presentation={presentation}
                timing={linearTiming({
                  durationInFrames: secToFrames(tr.duration_sec, fps),
                })}
              />,
            );
          }
        }
      }
    });
    return nodes;
  }, [videos, transitions, fps, editorClock, disableParallax, disableAnimations]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill style={gradeFilter ? { filter: gradeFilter } : undefined}>
        {editorClock ? (
          <EditorClockVideoTrack
            videos={videos}
            transitions={transitions}
            clipAudioVolume={clipAudioVolume}
          />
        ) : (
          <TransitionSeries>{seriesChildren}</TransitionSeries>
        )}
        <GapMask videos={videos} enabled={editorClock} />

        {broll.map((clip) => {
          const mapped = intervalOnClock(clip.start_sec, clip.duration_sec, manifest, editorClock);
          return (
            <Sequence
              key={clip.id}
              from={clipFromFrame(mapped.startSec, fps)}
              durationInFrames={clipDurationFrames(mapped.durationSec, fps)}
              name={`broll-${clip.id}`}
              layout="none"
            >
              <AnimatedMediaClip
                clip={clip}
                preferHtml5Video={editorClock}
                clipAudioVolume={clipAudioVolume}
                disableParallax={disableParallax}
                disableAnimations={disableAnimations}
              />
            </Sequence>
          );
        })}
      </AbsoluteFill>

      <CaptionTrack
        captions={captions}
        enabled={!disableCaptions && settings?.captions_enabled !== false}
        manifest={manifest}
        captionColor={theme.palette.captionPrimary}
        editorClock={editorClock}
      />
      <OverlayTrack
        overlays={overlays}
        manifest={manifest}
        theme={theme}
        editorClock={editorClock}
        disableAnimations={disableAnimations}
      />

      {!muteAudio
        ? audio
            .filter((a) => a.src && !a.src.startsWith("color:"))
            .map((a) => {
              const mapped = intervalOnClock(a.start_sec, a.duration_sec, manifest, editorClock);
              const durationInFrames = clipDurationFrames(mapped.durationSec, fps);
              return (
                <Sequence
                  key={a.id}
                  from={clipFromFrame(mapped.startSec, fps)}
                  durationInFrames={durationInFrames}
                  name={`audio-${a.id}`}
                >
                  <Audio
                    src={a.src}
                    startFrom={secToFrameOffset(a.source_start_sec ?? 0, fps)}
                    volume={(f) =>
                      audioVolumeAtFrame({
                        frame: f,
                        durationInFrames,
                        fps,
                        clipVolume: a.volume,
                        busVolume: narrationBus,
                        fadeInSec: a.fade_in_sec,
                        fadeOutSec: a.fade_out_sec,
                      })
                    }
                  />
                </Sequence>
              );
            })
        : null}
      {!muteAudio
        ? music
            .filter((m) => m.src && !m.src.startsWith("color:"))
            .map((m) => {
              const mapped = intervalOnClock(m.start_sec, m.duration_sec, manifest, editorClock);
              const durationInFrames = clipDurationFrames(mapped.durationSec, fps);
              const bus = m.mood === "sfx" ? sfxBus : musicBus;
              const isSfx = m.mood === "sfx";
              return (
                <Sequence
                  key={m.id}
                  from={clipFromFrame(mapped.startSec, fps)}
                  durationInFrames={durationInFrames}
                  name={`music-${m.id}`}
                >
                  <Audio
                    src={m.src}
                    startFrom={secToFrameOffset(m.source_start_sec ?? 0, fps)}
                    volume={(f) => {
                      const absSec = mapped.startSec + f / fps;
                      const duck =
                        !isSfx && narrationCoversSec(absSec, audio)
                          ? MUSIC_DUCK_UNDER_NARRATION
                          : 1;
                      return audioVolumeAtFrame({
                        frame: f,
                        durationInFrames,
                        fps,
                        clipVolume: m.volume ?? 0.28,
                        busVolume: bus,
                        fadeInSec: m.fade_in_sec,
                        fadeOutSec: m.fade_out_sec,
                        duck,
                      });
                    }}
                  />
                </Sequence>
              );
            })
        : null}
    </AbsoluteFill>
  );
};
