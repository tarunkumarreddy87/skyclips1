/**
 * Premium 2026 caption styles for the video editor preview.
 *
 * Each preset returns inline CSS + optional wrapper classes. The preview is a
 * CSS approximation; Remotion export carries fontSize/color/fontWeight only,
 * so presets that rely purely on color/shadow/background export faithfully.
 *
 * Presets are selected via `stylePreset` on the caption item, defaulting to
 * "modern" (the clean 2026 look). The legacy inline color/fontWeight on the
 * item still apply — presets layer on top.
 */

export interface CaptionPreset {
  /** Display label shown in the inspector picker. */
  label: string;
  /** Small preview swatch for the picker. */
  swatch: string;
  /** Inline styles applied to the caption <span>. */
  spanStyle: React.CSSProperties;
  /** Optional class names for the caption wrapper. */
  wrapperClass?: string;
  /** Whether to render a background pill (some styles are background-less). */
  background: "none" | "solid" | "gradient" | "glass";
}

export const CAPTION_PRESETS: Record<string, CaptionPreset> = {
  // Clean modern — the 2026 default. Subtle glass pill, crisp white text,
  // soft layered shadow for legibility on any footage.
  modern: {
    label: "Modern",
    swatch: "linear-gradient(135deg,#1e293b,#0f172a)",
    background: "glass",
    spanStyle: {
      fontWeight: 600,
      letterSpacing: "0.01em",
      textShadow:
        "0 1px 1px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.65), 0 0 18px rgba(0,0,0,0.35)",
    },
    wrapperClass: "bg-white/8 backdrop-blur-md ring-1 ring-white/15",
  },
  // Bold pop — high-contrast white on a near-solid dark plate. TikTok/Reels energy.
  bold: {
    label: "Bold",
    swatch: "linear-gradient(135deg,#000,#1a1a1a)",
    background: "solid",
    spanStyle: {
      fontWeight: 800,
      letterSpacing: "-0.01em",
      textTransform: "uppercase",
      textShadow: "0 2px 4px rgba(0,0,0,0.9)",
    },
    wrapperClass: "bg-black/85",
  },
  // Neon glow — electric accent with a soft glow halo. Creator/tech vibe.
  neon: {
    label: "Neon",
    swatch: "linear-gradient(135deg,#22d3ee,#3b82f6)",
    background: "none",
    spanStyle: {
      fontWeight: 700,
      color: "#a5f3fc",
      textShadow:
        "0 0 4px rgba(34,211,238,0.95), 0 0 14px rgba(59,130,246,0.7), 0 2px 10px rgba(0,0,0,0.6)",
    },
  },
  // Outlined — transparent fill, white stroke. YouTube-essay aesthetic.
  outline: {
    label: "Outline",
    swatch: "linear-gradient(135deg,#fafafa,#e4e4e7)",
    background: "none",
    spanStyle: {
      fontWeight: 700,
      color: "#ffffff",
      WebkitTextStroke: "1.5px rgba(0,0,0,0.9)",
      textShadow: "0 2px 8px rgba(0,0,0,0.5)",
    },
  },
  // Gradient text — vibrant clip-path gradient fill. Premium social style.
  gradient: {
    label: "Gradient",
    swatch: "linear-gradient(135deg,#f59e0b,#ef4444,#ec4899)",
    background: "none",
    spanStyle: {
      fontWeight: 800,
      backgroundImage: "linear-gradient(135deg,#fbbf24,#f472b6 60%,#a78bfa)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))",
    },
  },
  // Minimal — no background, classic cinematic subtitle shadow.
  minimal: {
    label: "Minimal",
    swatch: "linear-gradient(135deg,#27272a,#18181b)",
    background: "none",
    spanStyle: {
      fontWeight: 500,
      textShadow: "0 0 3px rgba(0,0,0,0.95), 0 2px 6px rgba(0,0,0,0.85)",
    },
  },
};

export const DEFAULT_CAPTION_PRESET = "modern";

export function getCaptionPreset(name: string | undefined | null): CaptionPreset {
  if (name && CAPTION_PRESETS[name]) return CAPTION_PRESETS[name];
  return CAPTION_PRESETS[DEFAULT_CAPTION_PRESET];
}
