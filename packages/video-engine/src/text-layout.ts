import { FONT_METRICS } from "./font-metrics.js";

export const ENGINE_SANS_FONT = "Lato";
export const ENGINE_SERIF_FONT = "Instrument Serif";

/** Preserve the scripts already supported by the narration pipeline. */
export function scriptFontFamily(text: string, fallback = ENGINE_SANS_FONT): string {
  // Character ranges keep this deterministic in browser and Node runtimes.
  const ranges: Array<[number, number, string]> = [
    [0x0900, 0x097f, "Noto Sans Devanagari"], [0x0980, 0x09ff, "Noto Sans Bengali"],
    [0x0a00, 0x0a7f, "Noto Sans Gurmukhi"], [0x0a80, 0x0aff, "Noto Sans Gujarati"],
    [0x0b80, 0x0bff, "Noto Sans Tamil"], [0x0c00, 0x0c7f, "Noto Sans Telugu"],
    [0x0c80, 0x0cff, "Noto Sans Kannada"], [0x0d00, 0x0d7f, "Noto Sans Malayalam"],
  ];
  for (const character of Array.from(text)) {
    const code = character.codePointAt(0)!;
    const range = ranges.find(([first, last]) => code >= first && code <= last);
    if (range) return range[2];
  }
  return fallback;
}

export function resolveEngineFontFamily(font?: string): string {
  const known: Record<string, string> = {
    system: ENGINE_SANS_FONT, inter: "Inter", montserrat: "Montserrat", oswald: "Oswald",
    bebas: "Bebas Neue", "roboto-condensed": "Roboto Condensed", playfair: "Playfair Display",
    lora: "Lora", "space-grotesk": "Space Grotesk",
  };
  return font ? known[font] ?? font : ENGINE_SANS_FONT;
}

export function escape(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
}

export function n(value: number): string { return (Number.isFinite(value) ? value : 0).toFixed(3); }

/** Bundled-font advances; explicit SVG textLength fixes browser/export layout. */
export function measureText(text: string, fontSize: number, family: boolean | string = false, weight = "700"): number {
  const resolvedFamily = scriptFontFamily(text, typeof family === "string" ? resolveEngineFontFamily(family) : family ? ENGINE_SERIF_FONT : ENGINE_SANS_FONT);
  const metrics = FONT_METRICS[`${resolvedFamily}:${Number(weight) >= 550 ? 700 : 400}`] ?? FONT_METRICS[`${resolvedFamily}:400`];
  return Array.from(text).reduce((sum, character) => {
    const advance = metrics?.[String(character.codePointAt(0))];
    if (advance != null) return sum + advance * fontSize;
    const factor = /[ilI!.,:;'|]/.test(character) ? 0.27 : /[MW@#%]/.test(character) ? 0.85
      : /\s/.test(character) ? 0.28 : /[\u2e80-\uffff]/.test(character) ? 1 : /[A-Z]/.test(character) ? 0.64 : 0.52;
    return sum + factor * fontSize;
  }, 0);
}

export function textNode(text: string, x: number, y: number, size: number, color: string, opts?: { family?: string; weight?: string; width?: number; anchor?: string; opacity?: number; outline?: boolean }): string {
  const width = opts?.width ?? measureText(text, size, opts?.family ?? ENGINE_SANS_FONT, opts?.weight);
  return `<text x="${n(x)}" y="${n(y)}" font-family="${escape(scriptFontFamily(text, opts?.family ?? ENGINE_SANS_FONT))}" font-size="${n(size)}" font-weight="${escape(opts?.weight ?? "700")}" fill="${escape(color)}" text-anchor="${opts?.anchor ?? "start"}" textLength="${n(width)}" lengthAdjust="spacingAndGlyphs" opacity="${n(opts?.opacity ?? 1)}"${opts?.outline ? ` paint-order="stroke fill" stroke="#09090b" stroke-width="${n(size * 0.055)}" stroke-linejoin="round"` : ""}>${escape(text)}</text>`;
}

