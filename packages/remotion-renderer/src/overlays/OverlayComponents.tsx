import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import {
  chapterTitleChromeStyle,
  resolveChapterVariant,
  subscribeCtaChromeStyle,
  type ChapterVariant,
} from "@hanuman/shared-types";
import type { Overlay } from "../lib/types";
import { clipDurationFrames } from "../lib/timing";
import { ApplyAnimation } from "../animations";
import type { getRemotionTheme } from "../lib/theme-grade";

type RemotionTheme = ReturnType<typeof getRemotionTheme>;

function transformOrigin(
  overlay: Overlay,
  opts?: { boxWidthPct?: number },
): React.CSSProperties {
  const t = overlay.transform;
  if (!t) return {};
  const x = t.x ?? 50;
  const y = t.y ?? 50;
  const sx = t.scaleX ?? 1;
  const sy = t.scaleY ?? 1;
  const uniform = Math.max(0.35, Math.min(3.5, (Math.abs(sx) + Math.abs(sy)) / 2));
  const flipX = Math.sign(sx) || 1;
  const flipY = Math.sign(sy) || 1;
  const widthPct = opts?.boxWidthPct;
  return {
    position: "absolute",
    left: `${x}%`,
    top: `${y}%`,
    transform: `translate(-50%, -50%) rotate(${t.rotation ?? 0}deg) scale(${flipX * uniform}, ${flipY * uniform})`,
    transformOrigin: "center center",
    zIndex: t.zIndex ?? 20,
    ...(widthPct != null ? { width: `${Math.max(18, Math.min(88, widthPct))}%` } : {}),
  };
}

function themeToChrome(theme?: RemotionTheme) {
  if (!theme) return null;
  return {
    accent: theme.palette.accent,
    primary: theme.palette.primary,
    text: theme.palette.text,
    chapterBox: theme.palette.chapterBox,
    chapterFontSize: theme.chapterFontSize,
    ctaFontSize: theme.ctaFontSize,
  };
}

/** Animated subscribe badge / pill CTA — theme palette when available. */
export const SubscribeCtaOverlay: React.FC<{
  overlay: Overlay;
  theme?: RemotionTheme;
  disableAnimations?: boolean;
}> = ({ overlay, theme, disableAnimations = false }) => {
  const { fps } = useVideoConfig();
  const durationInFrames = clipDurationFrames(overlay.duration_sec, fps);
  const placed = Boolean(overlay.transform);
  const chrome = subscribeCtaChromeStyle(themeToChrome(theme));

  const badge = (
    <ApplyAnimation
      animation={
        overlay.animation ?? {
          in: { preset: "pop", duration_sec: 0.45 },
          loop: { preset: "pulse" },
        }
      }
      durationInFrames={durationInFrames}
      style={{ width: "auto", height: "auto" }}
      disableAnimations={disableAnimations}
    >
      <div style={chrome.badge as React.CSSProperties}>
        <span style={chrome.dot as React.CSSProperties} />
        {overlay.text ?? "Subscribe"}
      </div>
    </ApplyAnimation>
  );

  if (placed) {
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div style={transformOrigin(overlay)}>{badge}</div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "flex-end",
        padding: 56,
        pointerEvents: "none",
      }}
    >
      {badge}
    </AbsoluteFill>
  );
};

/** Chapter title or lower-third style strip. */
export const ChapterTitleOverlay: React.FC<{
  overlay: Overlay;
  variant?: ChapterVariant;
  theme?: RemotionTheme;
  disableAnimations?: boolean;
}> = ({ overlay, variant = "chapter", theme, disableAnimations = false }) => {
  const { fps } = useVideoConfig();
  const durationInFrames = clipDurationFrames(overlay.duration_sec, fps);
  const resolved = resolveChapterVariant(variant, overlay.transform?.y);
  const isLower = resolved === "lower-third";
  const placed = Boolean(overlay.transform);
  const chipStyle = chapterTitleChromeStyle(resolved, themeToChrome(theme));
  const boxWidthPct = overlay.style?.box_width_pct ?? 70;

  const chip = (
    <ApplyAnimation
      animation={
        overlay.animation ?? {
          in: { preset: "slide", duration_sec: 0.5 },
          out: { preset: "fade", duration_sec: 0.35 },
        }
      }
      durationInFrames={durationInFrames}
      style={{ width: "100%", height: "auto" }}
      disableAnimations={disableAnimations}
    >
      <div
        style={{
          ...(chipStyle as React.CSSProperties),
          maxWidth: "100%",
          width: "100%",
          boxSizing: "border-box",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {overlay.text ?? (isLower ? "Title" : "Chapter")}
      </div>
    </ApplyAnimation>
  );

  if (placed) {
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div style={transformOrigin(overlay, { boxWidthPct })}>{chip}</div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        justifyContent: isLower ? "flex-end" : "flex-start",
        alignItems: "flex-start",
        padding: isLower ? "0 48px 72px" : 48,
        pointerEvents: "none",
      }}
    >
      {chip}
    </AbsoluteFill>
  );
};

const TEXT_FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, "Helvetica Neue", sans-serif';
const TEXT_SHADOW =
  "0 2px 4px rgba(0,0,0,0.85), 0 8px 28px rgba(0,0,0,0.55), 0 0 1px rgba(0,0,0,0.9)";

function resolveOverlayFontFamily(raw?: string): string {
  if (!raw?.trim()) return TEXT_FONT;
  const presets: Record<string, string> = {
    system: TEXT_FONT,
    inter: '"Inter", ui-sans-serif, system-ui, sans-serif',
    montserrat: '"Montserrat", ui-sans-serif, system-ui, sans-serif',
    oswald: '"Oswald", ui-sans-serif, system-ui, sans-serif',
    bebas: '"Bebas Neue", ui-sans-serif, system-ui, sans-serif',
    "roboto-condensed": '"Roboto Condensed", ui-sans-serif, system-ui, sans-serif',
    playfair: '"Playfair Display", Georgia, serif',
    lora: '"Lora", Georgia, serif',
    "space-grotesk": '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
  };
  if (presets[raw]) return presets[raw]!;
  if (/^[A-Za-z0-9 _-]+$/.test(raw) && !raw.includes(",")) {
    return `"${raw}", ${TEXT_FONT}`;
  }
  return raw;
}

/**
 * Freeform title / card text — position + rotation + font size (not image-like box scale).
 * Uniform transform scale multiplies font size for corner-drag WYSIWYG.
 */
export const FreeformTextOverlay: React.FC<{
  overlay: Overlay;
  disableAnimations?: boolean;
}> = ({ overlay, disableAnimations = false }) => {
  const { fps } = useVideoConfig();
  const durationInFrames = clipDurationFrames(overlay.duration_sec, fps);
  const t = overlay.transform;
  const x = t?.x ?? 50;
  const y = t?.y ?? 50;
  const rotation = t?.rotation ?? 0;
  const sx = t?.scaleX ?? 1;
  const sy = t?.scaleY ?? 1;
  const flipX = Math.sign(sx) || 1;
  const flipY = Math.sign(sy) || 1;
  const uniform = Math.max(0.25, Math.min(4, (Math.abs(sx) + Math.abs(sy)) / 2));
  const basePx = Math.max(36, overlay.style?.font_size_px ?? 84);
  const fontSize = Math.round(basePx * uniform);
  const align = overlay.style?.alignment ?? "center";
  const color = overlay.style?.color ?? "#ffffff";
  const weight = overlay.style?.font_weight ?? "600";
  const fontFamily = resolveOverlayFontFamily(overlay.style?.font_family);
  const boxWidthPct = Math.max(18, Math.min(88, overlay.style?.box_width_pct ?? 56));

  const body = (
    <ApplyAnimation
      animation={
        overlay.animation ?? {
          in: { preset: "fade", duration_sec: 0.35 },
          out: { preset: "fade", duration_sec: 0.3 },
        }
      }
      durationInFrames={durationInFrames}
      style={{ width: "100%", height: "auto" }}
      disableAnimations={disableAnimations}
    >
      <div
        style={{
          width: "100%",
          padding: "0.2em 0.55em",
          fontSize,
          fontWeight: weight,
          fontFamily,
          color,
          textAlign: align,
          lineHeight: 1.2,
          letterSpacing: "-0.01em",
          textShadow: TEXT_SHADOW,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {overlay.text || "Text"}
      </div>
    </ApplyAnimation>
  );

  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "visible" }}>
      <div
        style={{
          position: "absolute",
          left: `${x}%`,
          top: `${y}%`,
          transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${flipX}, ${flipY})`,
          transformOrigin: "center center",
          zIndex: t?.zIndex ?? 12,
          width: `${boxWidthPct}%`,
        }}
      >
        {body}
      </div>
    </AbsoluteFill>
  );
};
