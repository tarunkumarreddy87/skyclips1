import type { ThemeVisualGrade } from "@hanuman/shared-types";

/** Map theme `eq` grade to a CSS filter for live preview (Remotion applies the real grade). */
export function themeGradeCssFilter(grade: ThemeVisualGrade | null | undefined): string | undefined {
  if (!grade || grade.intensity <= 0) return undefined;
  const intensity = Math.max(0, Math.min(1, grade.intensity));
  const parsed: Record<string, number> = {};
  for (const part of grade.eq.split(":")) {
    const [key, raw] = part.split("=");
    if (!key || raw == null) continue;
    const n = Number(raw);
    if (Number.isFinite(n)) parsed[key.trim()] = n;
  }

  const contrast = 1 + ((parsed.contrast ?? 1) - 1) * intensity;
  // Theme grade brightness is additive (−1…1); CSS brightness is a multiplier.
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
