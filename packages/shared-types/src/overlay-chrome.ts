/**
 * Shared chrome styles for chapter title / subscribe CTA.
 * Used by editor CSS preview and Remotion overlays so visual look stays aligned
 * (ADR 0009 — Remotion still owns frame-accurate animation timing).
 */

export type OverlayChromeTheme = {
  accent?: string;
  primary?: string;
  text?: string;
  chapterBox?: string;
  chapterFontSize?: number;
  ctaFontSize?: number;
};

/** Convert theme palette tokens (0xRRGGBB / black@0.55) to CSS colors. */
export function cssColorFromThemeToken(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const s = raw.trim();
  if (s.startsWith("#") || s.startsWith("rgb")) return s;
  if (s === "white") return "#ffffff";
  if (s === "black") return "#000000";
  const at = s.match(/^(?:0x)?([0-9a-fA-F]{6}|black)@([0-9.]+)$/);
  if (at) {
    const alpha = Number(at[2]);
    if (at[1]!.toLowerCase() === "black") {
      return `rgba(0,0,0,${Number.isFinite(alpha) ? alpha : 0.55})`;
    }
    const hex = at[1]!;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${Number.isFinite(alpha) ? alpha : 0.55})`;
  }
  const hex = s.match(/^(?:0x)?([0-9a-fA-F]{6})$/);
  if (hex) return `#${hex[1]}`;
  return fallback;
}

/** Build OverlayChromeTheme from shared ThemePreset-like palette. */
export function overlayChromeFromPalette(
  palette: {
    primary?: string;
    accent?: string;
    text?: string;
    chapterBox?: string;
  },
  sizes?: { chapterFontSize?: number; ctaFontSize?: number },
): OverlayChromeTheme {
  return {
    primary: cssColorFromThemeToken(palette.primary, "#8b1024"),
    accent: cssColorFromThemeToken(palette.accent, "#c41e3a"),
    text: cssColorFromThemeToken(palette.text, "#ffffff"),
    chapterBox: cssColorFromThemeToken(palette.chapterBox, "rgba(0,0,0,0.55)"),
    chapterFontSize: sizes?.chapterFontSize,
    ctaFontSize: sizes?.ctaFontSize,
  };
}

export type ChapterVariant = "chapter" | "lower-third";

/** Plain style bag (React.CSSProperties-compatible). */
export type StyleBag = Record<string, string | number | undefined>;

export function resolveChapterVariant(
  variant: ChapterVariant | undefined,
  yPercent?: number | null,
): ChapterVariant {
  if (variant === "lower-third") return "lower-third";
  if (variant === "chapter") return "chapter";
  return (yPercent ?? 0) > 65 ? "lower-third" : "chapter";
}

export function chapterTitleChromeStyle(
  variant: ChapterVariant,
  theme?: OverlayChromeTheme | null,
  opts?: { previewScale?: boolean },
): StyleBag {
  const isLower = variant === "lower-third";
  const chapterBg =
    theme?.chapterBox ?? (isLower ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0.55)");
  const accent = theme?.accent ?? "#e2b84a";
  const textColor = theme?.text ?? "#fff";
  const baseSize = theme?.chapterFontSize ?? 52;
  const fontSize = opts?.previewScale
    ? isLower
      ? 15
      : 14
    : isLower
      ? Math.round(baseSize * 0.58)
      : Math.round(baseSize * 0.42);

  return {
    background: chapterBg,
    color: textColor,
    padding: isLower ? (opts?.previewScale ? "8px 14px" : "14px 28px") : opts?.previewScale ? "6px 12px" : "10px 18px",
    borderRadius: isLower ? 4 : 6,
    borderLeft: isLower ? `4px solid ${accent}` : undefined,
    fontSize,
    fontWeight: 700,
    fontFamily: "Georgia, 'Times New Roman', serif",
    letterSpacing: 0.3,
    boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
    maxWidth: opts?.previewScale ? "100%" : 720,
  };
}

export function subscribeCtaChromeStyle(
  theme?: OverlayChromeTheme | null,
  opts?: { previewScale?: boolean },
): { badge: StyleBag; dot: StyleBag; background: string } {
  const background = theme?.accent && theme?.primary
    ? `linear-gradient(135deg, ${theme.accent} 0%, ${theme.primary} 100%)`
    : "linear-gradient(135deg, #c41e3a 0%, #8b1024 100%)";
  const fontSize = theme?.ctaFontSize ?? 26;
  const size = opts?.previewScale
    ? 12
    : Math.max(22, Math.round(fontSize * 0.62));

  return {
    background,
    badge: {
      display: "inline-flex",
      alignItems: "center",
      gap: opts?.previewScale ? 8 : 10,
      background,
      color: theme?.text ?? "#fff",
      padding: opts?.previewScale ? "8px 14px" : "12px 22px",
      borderRadius: 999,
      fontSize: size,
      fontWeight: 800,
      fontFamily: "system-ui, Segoe UI, sans-serif",
      letterSpacing: 0.4,
      boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
      border: "2px solid rgba(255,255,255,0.2)",
      whiteSpace: "nowrap",
    },
    dot: {
      width: opts?.previewScale ? 10 : 14,
      height: opts?.previewScale ? 10 : 14,
      borderRadius: "50%",
      background: "#fff",
      boxShadow: "0 0 0 3px rgba(255,255,255,0.25)",
      flexShrink: 0,
    },
  };
}
