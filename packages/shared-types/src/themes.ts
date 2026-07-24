/** Video visual themes — one per project, applied consistently across overlays/grade/transitions. */

export type ThemeId = "crime" | "history" | "modern" | "minimalist" | "standard";

export interface ThemePalette {
  /** CTA / accent box fill (FFmpeg 0xRRGGBB, no #). */
  primary: string;
  accent: string;
  text: string;
  /** Chapter title box (e.g. black@0.55). */
  chapterBox: string;
  captionPrimary: string;
}

export interface ThemeVisualGrade {
  /** 0 = off, 1 = full theme grade. */
  intensity: number;
  /** FFmpeg eq filter fragment (contrast/brightness/saturation). */
  eq: string;
}

export interface ThemePreset {
  id: ThemeId;
  name: string;
  description: string;
  palette: ThemePalette;
  /** Relative caption/overlay size multiplier. */
  fontScale: number;
  ctaFontSize: number;
  chapterFontSize: number;
  /** Preferred transition cycle order (FFmpeg-native types). */
  transitionPreference: Array<"zoom" | "slide-pan" | "film-burn" | "glitch">;
  visualGrade: ThemeVisualGrade;
  /** Reserved for chart/stat templates when those land in FFmpeg. */
  chart: {
    barColor: string;
    lineColor: string;
    pieColors: string[];
  };
}

export const THEME_PRESETS: Record<ThemeId, ThemePreset> = {
  crime: {
    id: "crime",
    name: "Crime",
    description: "Dark, dramatic — true crime and investigative stories",
    palette: {
      primary: "0x7F1D1D",
      accent: "0xEF4444",
      text: "white",
      chapterBox: "black@0.72",
      captionPrimary: "0xFCA5A5",
    },
    fontScale: 1.05,
    ctaFontSize: 42,
    chapterFontSize: 56,
    transitionPreference: ["glitch", "film-burn", "zoom", "slide-pan"],
    visualGrade: {
      intensity: 0.85,
      eq: "contrast=1.18:brightness=-0.06:saturation=0.78",
    },
    chart: {
      barColor: "0xEF4444",
      lineColor: "0xFCA5A5",
      pieColors: ["0x7F1D1D", "0xEF4444", "0xFCA5A5", "0x450A0A"],
    },
  },
  history: {
    id: "history",
    name: "History",
    description: "Timeless, classic — documentary and archival tone",
    palette: {
      primary: "0x92400E",
      accent: "0xD97706",
      text: "0xFEF3C7",
      chapterBox: "0x1C1917@0.62",
      captionPrimary: "0xFDE68A",
    },
    fontScale: 1.0,
    ctaFontSize: 38,
    chapterFontSize: 50,
    transitionPreference: ["film-burn", "zoom", "slide-pan", "glitch"],
    visualGrade: {
      intensity: 0.7,
      eq: "contrast=1.08:brightness=-0.02:saturation=0.72",
    },
    chart: {
      barColor: "0xD97706",
      lineColor: "0xF59E0B",
      pieColors: ["0x92400E", "0xD97706", "0xFDE68A", "0x78350F"],
    },
  },
  modern: {
    id: "modern",
    name: "Modern",
    description: "Sleek, vibrant — tech, news, and explainers",
    palette: {
      primary: "0x0369A1",
      accent: "0x0EA5E9",
      text: "white",
      chapterBox: "0x0C4A6E@0.55",
      captionPrimary: "0x7DD3FC",
    },
    fontScale: 1.0,
    ctaFontSize: 40,
    chapterFontSize: 52,
    transitionPreference: ["zoom", "slide-pan", "glitch", "film-burn"],
    visualGrade: {
      intensity: 0.55,
      eq: "contrast=1.1:brightness=0.02:saturation=1.15",
    },
    chart: {
      barColor: "0x0EA5E9",
      lineColor: "0x38BDF8",
      pieColors: ["0x0369A1", "0x0EA5E9", "0x7DD3FC", "0x075985"],
    },
  },
  minimalist: {
    id: "minimalist",
    name: "Minimalist",
    description: "Clean, subtle — understated overlays and soft grade",
    palette: {
      primary: "0x3F3F46",
      accent: "0xA1A1AA",
      text: "white",
      chapterBox: "black@0.35",
      captionPrimary: "0xE4E4E7",
    },
    fontScale: 0.92,
    ctaFontSize: 34,
    chapterFontSize: 44,
    transitionPreference: ["slide-pan", "zoom", "film-burn", "glitch"],
    visualGrade: {
      intensity: 0.25,
      eq: "contrast=1.02:brightness=0.01:saturation=0.92",
    },
    chart: {
      barColor: "0x71717A",
      lineColor: "0xA1A1AA",
      pieColors: ["0x3F3F46", "0x71717A", "0xA1A1AA", "0x27272A"],
    },
  },
  standard: {
    id: "standard",
    name: "Standard",
    description: "Neutral, adaptable — default brand look",
    palette: {
      primary: "0xE11D48",
      accent: "0xFB7185",
      text: "white",
      chapterBox: "black@0.45",
      captionPrimary: "0xFFFFFF",
    },
    fontScale: 1.0,
    ctaFontSize: 40,
    chapterFontSize: 52,
    transitionPreference: ["zoom", "slide-pan", "film-burn", "glitch"],
    visualGrade: {
      intensity: 0.0,
      eq: "contrast=1:brightness=0:saturation=1",
    },
    chart: {
      barColor: "0xE11D48",
      lineColor: "0xFB7185",
      pieColors: ["0xE11D48", "0xFB7185", "0xFDA4AF", "0x9F1239"],
    },
  },
};

export const THEME_LIST: ThemePreset[] = Object.values(THEME_PRESETS);

/** Channel brand profile — currently a thin wrapper around a theme id. */
export interface BrandProfile {
  id: string;
  name: string;
  themeId: ThemeId;
}

export const BRAND_PROFILES: BrandProfile[] = THEME_LIST.map((t) => ({
  id: t.id,
  name: t.name,
  themeId: t.id,
}));

/** Map legacy bp-* ids and free-form strings onto a ThemeId. */
export function resolveThemeId(brandProfileId: string | null | undefined): ThemeId {
  const raw = (brandProfileId || "standard").trim().toLowerCase();
  const aliases: Record<string, ThemeId> = {
    standard: "standard",
    crime: "crime",
    history: "history",
    modern: "modern",
    minimalist: "minimalist",
    "bp-1": "standard",
    "bp-2": "modern",
    "bp-3": "history",
    "theme-crime": "crime",
    "theme-history": "history",
    "theme-modern": "modern",
    "theme-minimalist": "minimalist",
    "theme-standard": "standard",
  };
  return aliases[raw] ?? "standard";
}

export function getTheme(brandProfileId: string | null | undefined): ThemePreset {
  return THEME_PRESETS[resolveThemeId(brandProfileId)];
}

/** Keyword → theme default for Quote inference. */
export function inferThemeFromText(text: string): ThemeId {
  const blob = text.toLowerCase();
  const rules: Array<{ theme: ThemeId; patterns: RegExp[] }> = [
    {
      theme: "crime",
      patterns: [
        /\btrue crime\b/,
        /\bmurder\b/,
        /\bserial killer\b/,
        /\binvestigat/,
        /\bforensic\b/,
        /\bcrime scene\b/,
        /\bhomicide\b/,
      ],
    },
    {
      theme: "history",
      patterns: [
        /\bhistor/,
        /\bancient\b/,
        /\bempire\b/,
        /\bwwii\b|\bworld war\b/,
        /\bmedieval\b/,
        /\barchaeolog/,
        /\bdocumentary about the past\b/,
      ],
    },
    {
      theme: "modern",
      patterns: [
        /\btech\b/,
        /\bai\b|\bartificial intelligence\b/,
        /\bstartup\b/,
        /\bsmartphone\b/,
        /\binternet\b/,
        /\bsocial media\b/,
        /\bfuture of\b/,
      ],
    },
    {
      theme: "minimalist",
      patterns: [/\bminimal\b/, /\bclean design\b/, /\bsimple\b.*\bexplain/, /\bcalm\b/],
    },
  ];
  for (const rule of rules) {
    if (rule.patterns.some((re) => re.test(blob))) return rule.theme;
  }
  return "standard";
}
