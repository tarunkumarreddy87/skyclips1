import React from "react";
import { AbsoluteFill, Html5Video, Img, OffthreadVideo, staticFile, useVideoConfig } from "remotion";
import type { ElementTransform, VideoClip } from "../lib/types";
import { clipDurationFrames } from "../lib/timing";
import { ApplyAnimation } from "../animations";
import { isParallaxAnimation, ParallaxPanClip } from "./ParallaxPan";

function resolveSrc(src: string): { kind: "color" | "file" | "url"; value: string } {
  if (src.startsWith("color:")) {
    return { kind: "color", value: src.slice("color:".length) };
  }
  if (src.startsWith("http://") || src.startsWith("https://")) {
    return { kind: "url", value: src };
  }
  if (src.startsWith("static:")) {
    return { kind: "file", value: staticFile(src.slice("static:".length)) };
  }
  return { kind: "url", value: src };
}

/**
 * Match editor CSS `mediaBoxStyle`: scaleX/Y → frame-relative width/height.
 * Applied inside AbsoluteFill (layout only) — never put left/top/transform on
 * AbsoluteFill itself (Remotion forces right/bottom:0 which letterboxes).
 */
function mediaFrameStyle(t?: ElementTransform): React.CSSProperties {
  const x = t?.x ?? 50;
  const y = t?.y ?? 50;
  const scaleX = Math.max(0.05, t?.scaleX ?? 1);
  const scaleY = Math.max(0.05, t?.scaleY ?? 1);
  const rotation = t?.rotation ?? 0;
  return {
    position: "absolute",
    left: `${x}%`,
    top: `${y}%`,
    right: "auto",
    bottom: "auto",
    width: `${scaleX * 100}%`,
    height: `${scaleY * 100}%`,
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    transformOrigin: "center center",
    zIndex: t?.zIndex ?? 0,
    overflow: "hidden",
  };
}

export const AnimatedMediaClip: React.FC<{
  clip: VideoClip;
  mode?: "full" | "inset";
  /**
   * Player/editorClock: Html5Video seeks smoothly with the composition frame.
   * Export: OffthreadVideo (frame-accurate encode).
   */
  preferHtml5Video?: boolean;
  /**
   * Preview-only A-roll media audio (0–1). Export always stays muted —
   * narration/music buses are the product mix.
   */
  clipAudioVolume?: number;
  /** Temporary A/B: skip ParallaxPanClip. */
  disableParallax?: boolean;
  /** Temporary A/B: ApplyAnimation no-op. */
  disableAnimations?: boolean;
}> = ({
  clip,
  mode = "full",
  preferHtml5Video = false,
  clipAudioVolume = 0,
  disableParallax = false,
  disableAnimations = false,
}) => {
  const { fps } = useVideoConfig();
  const durationInFrames = clipDurationFrames(clip.duration_sec, fps);
  const src = resolveSrc(clip.src);
  const fit = clip.fit ?? "cover";
  const volume =
    clip.muted || clipAudioVolume <= 0 ? 0 : Math.max(0, Math.min(1, clipAudioVolume));

  const mediaStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: fit,
    display: "block",
  };

  let media: React.ReactNode;
  if (src.kind === "color") {
    media = <div style={{ ...mediaStyle, backgroundColor: src.value }} />;
  } else if (clip.type === "video") {
    const startFrom = Math.round((clip.source_start_sec ?? 0) * fps);
    if (preferHtml5Video) {
      media = (
        <Html5Video
          src={src.value}
          style={mediaStyle}
          // Remotion ≥4.0 rejects startFrom+trimBefore together; trimBefore only.
          trimBefore={startFrom}
          volume={volume}
          muted={volume <= 0}
          // Soft-sync with editor clock; wider shift avoids sticky seeks during play.
          acceptableTimeShiftInSeconds={0.75}
          pauseWhenBuffering={false}
        />
      );
    } else {
      media = (
        <OffthreadVideo
          src={src.value}
          style={mediaStyle}
          trimBefore={startFrom}
          muted
          volume={0}
        />
      );
    }
  } else {
    media = <Img src={src.value} style={mediaStyle} />;
  }

  const frameStyle =
    mode === "inset"
      ? {
          ...mediaFrameStyle(clip.transform),
          width:
            clip.transform?.scaleX != null
              ? `${Math.max(0.05, clip.transform.scaleX) * 100}%`
              : "36%",
          height:
            clip.transform?.scaleY != null
              ? `${Math.max(0.05, clip.transform.scaleY) * 100}%`
              : "36%",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }
      : mediaFrameStyle(clip.transform);

  return (
    <AbsoluteFill>
      <div style={frameStyle}>
        {clip.type === "image" &&
        !disableParallax &&
        isParallaxAnimation(clip.animation) ? (
          <ParallaxPanClip
            imageUrl={src.kind === "url" || src.kind === "file" ? src.value : ""}
            fit={fit}
            animation={clip.animation}
            durationInFrames={durationInFrames}
            config={clip.animation?.loop?.params}
          />
        ) : (
          <ApplyAnimation
            animation={clip.animation}
            durationInFrames={durationInFrames}
            disableAnimations={disableAnimations}
          >
            {media}
          </ApplyAnimation>
        )}
      </div>
    </AbsoluteFill>
  );
};
