export function formatTimecode(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const frames = Math.floor((ms % 1000) / (1000 / 30));
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}.${pad(frames)}`;
  return `${pad(m)}:${pad(s)}.${pad(frames)}`;
}

export function msToPx(ms: number, zoom: number): number {
  return (ms / 1000) * zoom;
}

export function pxToMs(px: number, zoom: number): number {
  return (px / zoom) * 1000;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** px per second on the timeline ruler */
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 80;
export const DEFAULT_ZOOM = 8;
/** When auto-fitting, show this edit window (dense clips), not the full project length */
export const TIMELINE_EDIT_WINDOW_MS = 90_000;

export function computeFitZoom(
  durationMs: number,
  viewportWidthPx: number,
  editWindowMs = TIMELINE_EDIT_WINDOW_MS,
): number {
  if (viewportWidthPx <= 0) return DEFAULT_ZOOM;
  const visibleMs = Math.min(editWindowMs, durationMs);
  const zoom = viewportWidthPx / (visibleMs / 1000);
  return clamp(Math.round(zoom * 10) / 10, MIN_ZOOM, MAX_ZOOM);
}

/** Fit the entire project into the viewport (overview). */
export function computeOverviewZoom(durationMs: number, viewportWidthPx: number): number {
  if (viewportWidthPx <= 0 || durationMs <= 0) return DEFAULT_ZOOM;
  const zoom = viewportWidthPx / (durationMs / 1000);
  return clamp(Math.round(zoom * 10) / 10, MIN_ZOOM, MAX_ZOOM);
}

/** Zoom level that shows roughly `windowMs` around the playhead. */
export function computeWindowZoom(windowMs: number, viewportWidthPx: number): number {
  if (viewportWidthPx <= 0 || windowMs <= 0) return DEFAULT_ZOOM;
  const zoom = viewportWidthPx / (windowMs / 1000);
  return clamp(Math.round(zoom * 10) / 10, MIN_ZOOM, MAX_ZOOM);
}

export function scrollPlayheadIntoView(
  container: HTMLElement,
  playheadPx: number,
  padding = 80,
): void {
  const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
  let next = container.scrollLeft;

  if (playheadPx < container.scrollLeft + padding) {
    next = playheadPx - padding;
  } else if (playheadPx > container.scrollLeft + container.clientWidth - padding) {
    next = playheadPx - container.clientWidth + padding;
  } else {
    return;
  }

  container.scrollLeft = clamp(next, 0, maxScroll);
}

/** Center the playhead in the scroll viewport (after zoom changes). */
export function centerPlayheadInView(container: HTMLElement, playheadPx: number): void {
  const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
  container.scrollLeft = clamp(playheadPx - container.clientWidth / 2, 0, maxScroll);
}

/**
 * Pick a ruler tick spacing (seconds) that keeps labels readable at any zoom.
 * Targets ~one label every `targetLabelPx` pixels of timeline width so ticks
 * don't crowd when zoomed in or get sparse when zoomed out.
 */
export function computeRulerStepSec(
  durationSec: number,
  zoom: number,
  targetLabelPx = 72,
): number {
  if (zoom <= 0) return 1;
  // seconds-per-label that yields roughly targetLabelPx between labels
  const minStep = targetLabelPx / zoom;
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find((s) => s >= minStep) ?? 600;
}
export const TRACK_COLORS: Record<string, string> = {
  video: "bg-blue-600/80 border-blue-500",
  broll: "bg-indigo-600/80 border-indigo-500",
  narration: "bg-amber-500/90 border-amber-400",
  music: "bg-orange-500/70 border-orange-400",
  sfx: "bg-yellow-600/70 border-yellow-500",
  text: "bg-violet-600/80 border-violet-500",
  captions: "bg-sky-500/80 border-sky-400",
  animation: "bg-pink-600/80 border-pink-500",
};
