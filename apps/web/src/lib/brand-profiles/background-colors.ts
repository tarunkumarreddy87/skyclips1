/** Solid plate colours for brand background presets (timeline + native export). */

export const BACKGROUND_PRESET_COLORS: Record<string, string> = {
  "bg-waves": "#0f172a",
  "bg-grid": "#18181b",
  "bg-green": "#065f46",
  "bg-sky": "#38bdf8",
  "bg-cream": "#fef3c7",
  "bg-black": "#000000",
  "bg-red-grid": "#450a0a",
  "bg-paper": "#e7d5b8",
  "bg-crimson": "#450a0a",
  "bg-custom": "#09090b",
};

export function backgroundColorForId(id: string | null | undefined): string {
  if (!id) return "#000000";
  return BACKGROUND_PRESET_COLORS[id] ?? "#000000";
}
