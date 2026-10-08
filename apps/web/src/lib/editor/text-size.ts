/** Editor size controls use logical units; persisted manifests always use 1080p pixels. */
const TEXT_FACTOR = 3.4;
const CAPTION_FACTOR = 3;

function toPixels(value: number | undefined, fallback: number, factor: number, max: number) {
  const size = Number.isFinite(value) ? Number(value) : fallback;
  return Math.max(8, Math.min(max, Math.round(size * factor)));
}

export const compositionTextFontPx = (size?: number) => toPixels(size, 28, TEXT_FACTOR, 200);
export const compositionCaptionFontPx = (size?: number) => toPixels(size, 22, CAPTION_FACTOR, 120);
// Do not round logical units: re-saving an imported 109px font must stay 109px.
export const editorTextFontSize = (pixels: number) => pixels / TEXT_FACTOR;
export const editorCaptionFontSize = (pixels: number) => pixels / CAPTION_FACTOR;
