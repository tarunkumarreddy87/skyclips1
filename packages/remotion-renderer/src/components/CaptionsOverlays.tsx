import React, { useMemo } from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import {
  activeWordIndex,
  resolveCaptionStyleId,
  wordsForCaption,
  type CaptionStyleId,
} from "@hanuman/shared-types";
import type { CaptionClip, ElementTransform, Overlay, TimelineManifestV1 } from "../lib/types";
import {
  clipDurationFrames,
  clipFromFrame,
  mapEditorIntervalToExport,
} from "../lib/timing";
import type { getRemotionTheme } from "../lib/theme-grade";
import { ApplyAnimation } from "../animations";
import { ChapterTitleOverlay, SubscribeCtaOverlay, FreeformTextOverlay } from "../overlays/OverlayComponents";

type RemotionTheme = ReturnType<typeof getRemotionTheme>;

/**
 * Caption layout — must stay in sync with editor hit-targets (preview-section).
 * Explicit box width % (Creativly-style); never max-content (that wraps copy downward).
 */
export function captionBoxStyle(
  t?: ElementTransform,
  boxWidthPct = 72,
): React.CSSProperties {
  const widthPct = Math.max(18, Math.min(88, boxWidthPct));
  if (!t) {
    return {
      position: "absolute",
      left: "50%",
      bottom: 72,
      transform: "translateX(-50%)",
      width: `${widthPct}%`,
      overflow: "visible",
    };
  }
  const sx = t.scaleX ?? 1;
  const sy = t.scaleY ?? 1;
  const flipX = Math.sign(sx) || 1;
  const flipY = Math.sign(sy) || 1;
  return {
    position: "absolute",
    left: `${t.x ?? 50}%`,
    top: `${t.y ?? 86}%`,
    transform: `translate(-50%, -50%) rotate(${t.rotation ?? 0}deg) scale(${flipX}, ${flipY})`,
    transformOrigin: "center center",
    width: `${widthPct}%`,
    zIndex: t.zIndex ?? 10,
    overflow: "visible",
  };
}

const SHADOW =
  "0 2px 4px rgba(0,0,0,0.9), 0 4px 18px rgba(0,0,0,0.7), 0 0 1px rgba(0,0,0,0.95)";
const CAPTION_FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, "Helvetica Neue", sans-serif';

/** Default lower-third when a caption/text clip has no authored transform. */
export const DEFAULT_CAPTION_TRANSFORM: ElementTransform = {
  x: 50,
  y: 84,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  zIndex: 20,
};

const CaptionItemInner: React.FC<{
  clip: CaptionClip;
  fallbackColor?: string;
  styleId: CaptionStyleId;
  /** Absolute start of this Sequence on the active clock (seconds). */
  absoluteStartSec: number;
}> = ({ clip, fallbackColor, styleId, absoluteStartSec }) => {
  const { fps, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const durationInFrames = clipDurationFrames(clip.duration_sec, fps);
  const boxTransform = clip.transform ?? DEFAULT_CAPTION_TRANSFORM;
  const sx = boxTransform.scaleX ?? 1;
  const sy = boxTransform.scaleY ?? 1;
  const uniform = Math.max(0.35, Math.min(3.5, (Math.abs(sx) + Math.abs(sy)) / 2));
  const size = Math.max(
    72,
    Math.round((clip.style?.font_size_px ?? height * 0.085) * uniform),
  );
  const color = clip.style?.color ?? fallbackColor ?? "#ffffff";
  const weight = clip.style?.font_weight ?? "800";
  const boxWidthPct = Math.max(18, Math.min(88, clip.style?.box_width_pct ?? 72));
  const nowSec = absoluteStartSec + frame / fps;

  const words = useMemo(
    () =>
      wordsForCaption({
        text: clip.text,
        startSec: absoluteStartSec,
        durationSec: clip.duration_sec,
        words: clip.words,
        wordsAnchorSec: clip.start_sec,
      }),
    [clip.text, clip.duration_sec, clip.words, clip.start_sec, absoluteStartSec],
  );
  const activeIdx = activeWordIndex(words, nowSec);

  let body: React.ReactNode;
  if (styleId === "karaoke") {
    body = (
      <div
        style={{
          textAlign: "center",
          fontSize: size,
          fontWeight: 800,
          fontFamily: CAPTION_FONT,
          textShadow: SHADOW,
          lineHeight: 1.22,
          letterSpacing: "0.01em",
        }}
      >
        {words.map((w, i) => {
          const spoken = i < activeIdx;
          const current = i === activeIdx;
          const on = spoken || current;
          return (
            <span key={`${w.start_sec}-${i}`}>
              <span
                style={{
                  color: on ? "#fbbf24" : "rgba(255,255,255,0.62)",
                  background: "transparent",
                  fontWeight: current ? 900 : 750,
                }}
              >
                {w.text}
              </span>
              {i < words.length - 1 ? " " : null}
            </span>
          );
        })}
      </div>
    );
  } else if (styleId === "boxed_pill") {
    body = (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0.35rem 0.4rem",
          textAlign: "center",
          fontSize: size,
          fontWeight: 700,
          fontFamily: CAPTION_FONT,
          textShadow: SHADOW,
          lineHeight: 1.22,
          letterSpacing: "0.01em",
          color,
        }}
      >
        {words.map((w, i) => {
          const current = i === activeIdx;
          return (
            <span
              key={`${w.start_sec}-${i}`}
              style={{
                padding: "0.12em 0.35em",
                borderRadius: 8,
                background: current ? "#38bdf8" : "transparent",
                color: current ? "#0a0a0a" : "rgba(255,255,255,0.9)",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    );
  } else {
    body = (
      <div
        style={{
          textAlign: "center",
          fontSize: size,
          fontWeight: weight,
          color,
          fontFamily: CAPTION_FONT,
          textShadow: SHADOW,
          lineHeight: 1.22,
          letterSpacing: "0.01em",
          background: "rgba(0,0,0,0.42)",
          padding: "0.4em 0.85em",
          borderRadius: 12,
        }}
      >
        {clip.text}
      </div>
    );
  }

  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "visible" }}>
      <div style={captionBoxStyle(boxTransform, boxWidthPct)}>
        <ApplyAnimation
          animation={clip.animation ?? { in: { preset: "fade", duration_sec: 0.35 } }}
          durationInFrames={durationInFrames}
          style={{ width: "100%", height: "auto", overflow: "visible" }}
        >
          {body}
        </ApplyAnimation>
      </div>
    </AbsoluteFill>
  );
};

const CaptionItem = React.memo(CaptionItemInner);

/** Prefer the most specific (shortest) caption when windows overlap. */
export function pickActiveCaptionId(
  captions: CaptionClip[],
  nowSec: number,
): string | null {
  const hits = captions.filter((c) => {
    if (!c.text?.trim()) return false;
    const end = c.start_sec + Math.max(0.05, c.duration_sec);
    return nowSec >= c.start_sec && nowSec < end;
  });
  if (!hits.length) return null;
  hits.sort(
    (a, b) =>
      a.duration_sec - b.duration_sec ||
      b.start_sec - a.start_sec ||
      a.id.localeCompare(b.id),
  );
  return hits[0]!.id;
}

/**
 * Trim overlapping caption windows so only one phrase paints at a time
 * (preview + export share this — documentary karaoke must not stack).
 */
export function resolveCaptionOverlapWindows(captions: CaptionClip[]): CaptionClip[] {
  const sorted = [...captions]
    .filter((c) => Boolean(c.text?.trim()))
    .sort((a, b) => a.start_sec - b.start_sec || a.duration_sec - b.duration_sec);
  if (sorted.length < 2) return sorted;
  const out: CaptionClip[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const next = sorted[i + 1];
    let duration = Math.max(0.05, cur.duration_sec);
    if (next) {
      const maxDur = next.start_sec - cur.start_sec;
      if (maxDur < duration) {
        duration = Math.max(0.05, maxDur);
      }
    }
    out.push(duration === cur.duration_sec ? cur : { ...cur, duration_sec: duration });
  }
  return out;
}

export const CaptionTrack: React.FC<{
  captions: CaptionClip[];
  enabled?: boolean;
  manifest: TimelineManifestV1;
  captionColor?: string;
  /** When true, place captions on editor absolute time (live preview WYSIWYG). */
  editorClock?: boolean;
}> = ({ captions, enabled = true, manifest, captionColor, editorClock = false }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const styleId = resolveCaptionStyleId(manifest.settings?.caption_style);
  // Keep the authored windows intact. The active-cue chooser below decides which
  // overlapping phrase paints, so a longer fallback cue is never truncated away.
  const resolved = useMemo(
    () => captions.filter((caption) => Boolean(caption.text?.trim())),
    [captions],
  );
  if (!enabled) return null;
  const scheduled = resolved.map((clip) => {
    const mapped = editorClock
      ? { startSec: clip.start_sec, durationSec: Math.max(1 / 30, clip.duration_sec) }
      : mapEditorIntervalToExport(clip.start_sec, clip.duration_sec, manifest);
    return { clip, mapped };
  });
  // A captions lane is a single visual stream. Pipelines may have overlapping
  // word/phrase windows, but the canvas and exported video must show one cue.
  const activeId = pickActiveCaptionId(
    scheduled.map(({ clip, mapped }) => ({
      ...clip,
      start_sec: mapped.startSec,
      duration_sec: mapped.durationSec,
    })),
    frame / fps,
  );
  return (
    <>
      {scheduled.map(({ clip: c, mapped }) => {
        if (c.id !== activeId) return null;
        return (
          <Sequence
            key={c.id}
            from={clipFromFrame(mapped.startSec, fps)}
            durationInFrames={clipDurationFrames(mapped.durationSec, fps)}
            name={`caption-${c.id}`}
            layout="none"
          >
            <CaptionItem
              clip={c}
              fallbackColor={captionColor}
              styleId={styleId}
              absoluteStartSec={mapped.startSec}
            />
          </Sequence>
        );
      })}
    </>
  );
};

function OverlayRouter({
  overlay,
  theme,
  disableAnimations = false,
}: {
  overlay: Overlay;
  theme: RemotionTheme;
  disableAnimations?: boolean;
}) {
  if (overlay.type === "subscribe_cta") {
    return (
      <SubscribeCtaOverlay
        overlay={overlay}
        theme={theme}
        disableAnimations={disableAnimations}
      />
    );
  }
  if (overlay.type === "freeform_text") {
    return <FreeformTextOverlay overlay={overlay} disableAnimations={disableAnimations} />;
  }
  const y = overlay.transform?.y ?? 20;
  return (
    <ChapterTitleOverlay
      overlay={overlay}
      variant={y > 65 ? "lower-third" : "chapter"}
      theme={theme}
      disableAnimations={disableAnimations}
    />
  );
}

export const OverlayTrack: React.FC<{
  overlays: Overlay[];
  manifest: TimelineManifestV1;
  theme: RemotionTheme;
  editorClock?: boolean;
  disableAnimations?: boolean;
}> = ({ overlays, manifest, theme, editorClock = false, disableAnimations = false }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {overlays.map((o) => {
        // Editor preview paints freeform text as HTML hit-targets (WYSIWYG).
        // Remotion still owns freeform for export / non-editorClock renders.
        if (editorClock && o.type === "freeform_text") return null;
        const mapped = editorClock
          ? { startSec: o.start_sec, durationSec: Math.max(1 / 30, o.duration_sec) }
          : mapEditorIntervalToExport(o.start_sec, o.duration_sec, manifest);
        return (
          <Sequence
            key={o.id}
            from={clipFromFrame(mapped.startSec, fps)}
            durationInFrames={clipDurationFrames(mapped.durationSec, fps)}
            name={`overlay-${o.id}`}
            layout="none"
          >
            <OverlayRouter
              overlay={o}
              theme={theme}
              disableAnimations={disableAnimations}
            />
          </Sequence>
        );
      })}
    </>
  );
};
