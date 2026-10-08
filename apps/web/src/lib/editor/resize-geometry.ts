import type { ElementTransform } from "./types";

export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** Pointer geometry in rendered pixels. The opposite edge/corner remains fixed. */
export function resizeGeometry(
  original: ElementTransform,
  handle: ResizeEdge,
  dx: number,
  dy: number,
  width: number,
  height: number,
  stageWidth: number,
  stageHeight: number,
  uniform: boolean,
  minScale = 0.05,
  maxScale = 4,
) {
  const angle = original.rotation * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const flipX = Math.sign(original.scaleX) || 1;
  const flipY = Math.sign(original.scaleY) || 1;
  const localX = (cos * dx + sin * dy) * flipX;
  const localY = (-sin * dx + cos * dy) * flipY;
  const xDirection = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const yDirection = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  const w = Math.max(1, width), h = Math.max(1, height);
  let ratioX = 1 + xDirection * localX / w;
  let ratioY = 1 + yDirection * localY / h;
  if (uniform) {
    const ratio = 1 + (xDirection * localX * w + yDirection * localY * h) / (w * w + h * h);
    const lower = Math.max(minScale / Math.abs(original.scaleX), minScale / Math.abs(original.scaleY));
    const upper = Math.min(maxScale / Math.abs(original.scaleX), maxScale / Math.abs(original.scaleY));
    ratioX = ratioY = Math.max(lower, Math.min(upper, ratio));
  } else {
    if (xDirection) ratioX = Math.max(minScale / Math.abs(original.scaleX), Math.min(maxScale / Math.abs(original.scaleX), ratioX));
    if (yDirection) ratioY = Math.max(minScale / Math.abs(original.scaleY), Math.min(maxScale / Math.abs(original.scaleY), ratioY));
  }
  const shiftX = xDirection * w * (ratioX - 1) * flipX / 2;
  const shiftY = yDirection * h * (ratioY - 1) * flipY / 2;
  return {
    ...original,
    x: original.x + (cos * shiftX - sin * shiftY) / stageWidth * 100,
    y: original.y + (sin * shiftX + cos * shiftY) / stageHeight * 100,
    scaleX: original.scaleX * ratioX,
    scaleY: original.scaleY * ratioY,
  };
}
