/**
 * Theme visual grade for Remotion (mirrors @hanuman/shared-types themes + web theme-grade-css).
 * Kept local so the Remotion Lambda/local bundle does not require workspace package resolution.
 */

export type ThemeId = "crime" | "history" | "modern" | "minimalist" | "standard";

interface ThemeGradePreset {
  id: ThemeId;
  intensity: number;
  eq: string;
  palette: {
    primary: string;
    accent: string;
    text: string;
    chapterBox: string;
    captionPrimary: string;
  };
  ctaFontSize: number;
  chapterFontSize: number;
}

const THEMES: Record<ThemeId, ThemeGradePreset> = {
  crime: {
    id: "crime",
    intensity: 0.85,
    eq: "contrast=1.18:brightness=-0.06:saturation=0.78",
    palette: {
      primary: "#7F1D1D",
      accent: "#EF4444",
      text: "#ffffff",
      chapterBox: "rgba(0,0,0,0.72)",
      captionPrimary: "#FCA5A5",
    },
    ctaFontSize: 42,
    chapterFontSize: 56,
  },
  history: {
    id: "history",
    intensity: 0.7,
    eq: "contrast=1.08:brightness=-0.02:saturation=0.72",
    palette: {
      primary: "#92400E",
      accent: "#D97706",
      text: "#FEF3C7",
      chapterBox: "rgba(28,25,23,0.62)",
      captionPrimary: "#FDE68A",
    },
    ctaFontSize: 38,
    chapterFontSize: 50,
  },
  modern: {
    id: "modern",
    intensity: 0.55,
    eq: "contrast=1.1:brightness=0.02:saturation=1.15",
    palette: {
      primary: "#0369A1",
      accent: "#0EA5E9",
      text: "#ffffff",
      chapterBox: "rgba(12,74,110,0.55)",
      captionPrimary: "#7DD3FC",
    },
    ctaFontSize: 40,
    chapterFontSize: 52,
  },
  minimalist: {
    id: "minimalist",
    intensity: 0.35,
    eq: "contrast=1.05:brightness=0.03:saturation=0.9",
    palette: {
      primary: "#27272A",
      accent: "#A1A1AA",
      text: "#FAFAFA",
      chapterBox: "rgba(24,24,27,0.5)",
      captionPrimary: "#E4E4E7",
    },
    ctaFontSize: 36,
    chapterFontSize: 48,
  },
  standard: {
    id: "standard",
    intensity: 0.4,
    eq: "contrast=1.06:brightness=0:saturation=1.0",
    palette: {
      primary: "#1D4ED8",
      accent: "#3B82F6",
      text: "#ffffff",
      chapterBox: "rgba(0,0,0,0.55)",
      captionPrimary: "#FFFFFF",
    },
    ctaFontSize: 40,
    chapterFontSize: 52,
  },
};

export function resolveThemeId(raw: string | null | undefined): ThemeId {
  if (!raw) return "standard";
  const key = raw.toLowerCase().replace(/^theme-/, "") as ThemeId;
  return key in THEMES ? key : "standard";
}

export function getRemotionTheme(themeId: string | null | undefined): ThemeGradePreset {
  return THEMES[resolveThemeId(themeId)];
}

/**
 * Temporary isolation flag (Lambda timeout investigation).
 * When true / env REMOTION_DISABLE_THEME_GRADE=1, skip the live CSS grade
 * so we can A/B render cost vs filter ON. Do not remove the feature — this
 * is a measurement switch only.
 */
export function isThemeGradeDisabled(override?: boolean): boolean {
  if (override === true) return true;
  if (override === false) return false;
  const env = typeof process !== "undefined" ? process.env?.REMOTION_DISABLE_THEME_GRADE : undefined;
  return env === "1" || env === "true";
}

/** CSS filter matching web preview `themeGradeCssFilter`. */
export function themeGradeCssFilter(
  themeId: string | null | undefined,
  options?: { disable?: boolean },
): string | undefined {
  if (isThemeGradeDisabled(options?.disable)) return undefined;
  const theme = getRemotionTheme(themeId);
  if (theme.intensity <= 0) return undefined;
  const intensity = Math.max(0, Math.min(1, theme.intensity));
  const parsed: Record<string, number> = {};
  for (const part of theme.eq.split(":")) {
    const [k, raw] = part.split("=");
    if (!k || raw == null) continue;
    const n = Number(raw);
    if (Number.isFinite(n)) parsed[k.trim()] = n;
  }
  const contrast = 1 + ((parsed.contrast ?? 1) - 1) * intensity;
  const brightness = 1 + (parsed.brightness ?? 0) * intensity;
  const saturate = 1 + ((parsed.saturation ?? 1) - 1) * intensity;
  if (
    Math.abs(contrast - 1) < 0.001 &&
    Math.abs(brightness - 1) < 0.001 &&
    Math.abs(saturate - 1) < 0.001
  ) {
    return undefined;
  }
  return `contrast(${contrast.toFixed(3)}) brightness(${brightness.toFixed(3)}) saturate(${saturate.toFixed(3)})`;
}
