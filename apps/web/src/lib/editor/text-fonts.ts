/**
 * Curated title fonts for freeform text (Creativly / CapCut-style picker).
 * Google families load in the editor shell; custom uploads register via FontFace.
 */

import { ensureEngineFontsLoaded } from "./engine-fonts";

export type EditorTextFont = {
  id: string;
  label: string;
  /** CSS font-family stack */
  family: string;
  /** Google Fonts family query segment, e.g. `Inter:wght@400;600;700;800` */
  google?: string;
  /** Serif / display / sans for grouping */
  category: "sans" | "serif" | "display" | "custom";
};

export type TextStylePreset = {
  id: string;
  label: string;
  preview: string;
  fontFamily: string;
  fontWeight: string;
  color: string;
  fontSize: number;
  /** Optional default in animation */
  motionIn?: "fade" | "pop" | "slide" | "float" | "drop" | "bounce" | "zoom_in" | "spin";
};

export const SYSTEM_TEXT_FONT: EditorTextFont = {
  id: "system",
  label: "System",
  family:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, "Helvetica Neue", sans-serif',
  category: "sans",
};

/** Creativly-like one-click title looks (font + weight + color + motion). */
export const TEXT_STYLE_PRESETS: TextStylePreset[] = [
  {
    id: "streamer",
    label: "Streamer",
    preview: "STREAMER",
    fontFamily: "bebas",
    fontWeight: "700",
    color: "#ffffff",
    fontSize: 36,
    motionIn: "pop",
  },
  {
    id: "editorial",
    label: "Editorial",
    preview: "EDITORIAL",
    fontFamily: "playfair",
    fontWeight: "700",
    color: "#f8fafc",
    fontSize: 30,
    motionIn: "fade",
  },
  {
    id: "influencer",
    label: "Influencer",
    preview: "INFLUENCER",
    fontFamily: "montserrat",
    fontWeight: "800",
    color: "#f472b6",
    fontSize: 32,
    motionIn: "slide",
  },
  {
    id: "minimal",
    label: "Minimal",
    preview: "MINIMAL",
    fontFamily: "inter",
    fontWeight: "500",
    color: "#e4e4e7",
    fontSize: 26,
    motionIn: "fade",
  },
  {
    id: "sport",
    label: "Sport",
    preview: "SPORT",
    fontFamily: "oswald",
    fontWeight: "700",
    color: "#fbbf24",
    fontSize: 38,
    motionIn: "drop",
  },
  {
    id: "bold-pop",
    label: "Bold Pop",
    preview: "BOLD POP",
    fontFamily: "space-grotesk",
    fontWeight: "800",
    color: "#a78bfa",
    fontSize: 34,
    motionIn: "bounce",
  },
  {
    id: "newsroom",
    label: "Newsroom",
    preview: "NEWSROOM",
    fontFamily: "roboto-condensed",
    fontWeight: "700",
    color: "#ffffff",
    fontSize: 28,
    motionIn: "slide",
  },
  {
    id: "kinetic",
    label: "Kinetic",
    preview: "KINETIC",
    fontFamily: "montserrat",
    fontWeight: "800",
    color: "#22d3ee",
    fontSize: 34,
    motionIn: "zoom_in",
  },
];

/** Premium presets — loaded from Google Fonts when `google` is set. */
export const EDITOR_TEXT_FONTS: EditorTextFont[] = [
  SYSTEM_TEXT_FONT,
  {
    id: "inter",
    label: "Inter",
    family: '"Inter", ui-sans-serif, system-ui, sans-serif',
    google: "Inter:wght@400;500;600;700;800",
    category: "sans",
  },
  {
    id: "montserrat",
    label: "Montserrat",
    family: '"Montserrat", ui-sans-serif, system-ui, sans-serif',
    google: "Montserrat:wght@500;600;700;800",
    category: "sans",
  },
  {
    id: "oswald",
    label: "Oswald",
    family: '"Oswald", ui-sans-serif, system-ui, sans-serif',
    google: "Oswald:wght@500;600;700",
    category: "display",
  },
  {
    id: "bebas",
    label: "Bebas Neue",
    family: '"Bebas Neue", ui-sans-serif, system-ui, sans-serif',
    google: "Bebas+Neue",
    category: "display",
  },
  {
    id: "roboto-condensed",
    label: "Roboto Condensed",
    family: '"Roboto Condensed", ui-sans-serif, system-ui, sans-serif',
    google: "Roboto+Condensed:wght@500;600;700",
    category: "sans",
  },
  {
    id: "playfair",
    label: "Playfair Display",
    family: '"Playfair Display", Georgia, serif',
    google: "Playfair+Display:wght@500;600;700;800",
    category: "serif",
  },
  {
    id: "lora",
    label: "Lora",
    family: '"Lora", Georgia, serif',
    google: "Lora:wght@500;600;700",
    category: "serif",
  },
  {
    id: "space-grotesk",
    label: "Space Grotesk",
    family: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
    google: "Space+Grotesk:wght@500;600;700",
    category: "sans",
  },
];

/** Load the same bundled static fonts used by cloud export. */
export function ensureEditorTextFontsLoaded(): void {
  ensureEngineFontsLoaded();
}

export function resolveTextFontFamily(fontFamily?: string | null): string {
  if (!fontFamily?.trim()) return SYSTEM_TEXT_FONT.family;
  const known = EDITOR_TEXT_FONTS.find(
    (f) => f.id === fontFamily || f.family === fontFamily || f.label === fontFamily,
  );
  if (known) return known.family;
  if (/^[A-Za-z0-9 _-]+$/.test(fontFamily) && !fontFamily.includes(",")) {
    return `"${fontFamily}", ${SYSTEM_TEXT_FONT.family}`;
  }
  return fontFamily;
}

export function fontIdFromFamily(fontFamily?: string | null): string {
  if (!fontFamily?.trim()) return SYSTEM_TEXT_FONT.id;
  const known = EDITOR_TEXT_FONTS.find(
    (f) => f.id === fontFamily || f.family === fontFamily || f.label === fontFamily,
  );
  return known?.id ?? fontFamily;
}

/** Register a user-uploaded .ttf / .otf / .woff / .woff2 for live preview. */
export async function importLocalTextFont(file: File): Promise<{
  id: string;
  label: string;
  family: string;
}> {
  const rawName = file.name.replace(/\.[^.]+$/, "").trim() || "Custom";
  const safe = rawName.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "CustomFont";
  const family = `SkyClipCustom_${safe}_${Date.now().toString(36)}`;
  const buffer = await file.arrayBuffer();
  const face = new FontFace(family, buffer);
  await face.load();
  document.fonts.add(face);
  return {
    id: family,
    label: rawName.slice(0, 28),
    family: `"${family}", ${SYSTEM_TEXT_FONT.family}`,
  };
}

/** Compact in/out presets shown on the Text inspector (full set lives in Animations panel). */
export const TEXT_MOTION_PRESETS = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "pop", label: "Pop" },
  { id: "slide", label: "Slide" },
  { id: "float", label: "Float" },
  { id: "drop", label: "Drop" },
  { id: "bounce", label: "Bounce" },
  { id: "zoom_in", label: "Zoom", outId: "zoom_out" },
  { id: "spin", label: "Spin" },
] as const;
