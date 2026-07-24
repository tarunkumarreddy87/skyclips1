import type { CSSProperties } from "react";
import type { ElementTransform } from "./types";

export const IDENTITY_TRANSFORM: ElementTransform = {
  x: 50,
  y: 50,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  zIndex: 0,
};

export function resolveTransform(
  transform?: Partial<ElementTransform> | null,
  fallbackPosition?: { x: number; y: number },
): ElementTransform {
  return {
    x: transform?.x ?? fallbackPosition?.x ?? IDENTITY_TRANSFORM.x,
    y: transform?.y ?? fallbackPosition?.y ?? IDENTITY_TRANSFORM.y,
    scaleX: transform?.scaleX ?? IDENTITY_TRANSFORM.scaleX,
    scaleY: transform?.scaleY ?? IDENTITY_TRANSFORM.scaleY,
    rotation: transform?.rotation ?? IDENTITY_TRANSFORM.rotation,
    zIndex: transform?.zIndex ?? IDENTITY_TRANSFORM.zIndex,
  };
}

export function isNearIdentity(t: ElementTransform, epsilon = 0.001): boolean {
  return (
    Math.abs(t.x - 50) < epsilon &&
    Math.abs(t.y - 50) < epsilon &&
    Math.abs(t.scaleX - 1) < epsilon &&
    Math.abs(t.scaleY - 1) < epsilon &&
    Math.abs(t.rotation) < epsilon
  );
}

/** Layout box for a full-frame media element driven by transform. */
export function mediaBoxStyle(t: ElementTransform): CSSProperties {
  const w = Math.max(0.05, Math.abs(t.scaleX)) * 100;
  const h = Math.max(0.05, Math.abs(t.scaleY)) * 100;
  const flipX = Math.sign(t.scaleX) || 1;
  const flipY = Math.sign(t.scaleY) || 1;
  return {
    position: "absolute",
    left: `${t.x}%`,
    top: `${t.y}%`,
    width: `${w}%`,
    height: `${h}%`,
    transform: `translate(-50%, -50%) rotate(${t.rotation}deg) scale(${flipX}, ${flipY})`,
    transformOrigin: "center center",
    zIndex: t.zIndex,
    willChange: "transform, left, top, width, height",
  };
}

export function clampTransform(t: ElementTransform): ElementTransform {
  const clampSigned = (v: number, min: number, max: number) => {
    const sign = Math.sign(v) || 1;
    return sign * Math.max(min, Math.min(max, Math.abs(v)));
  };
  return {
    x: Math.max(0, Math.min(100, t.x)),
    y: Math.max(0, Math.min(100, t.y)),
    scaleX: clampSigned(t.scaleX, 0.05, 4),
    scaleY: clampSigned(t.scaleY, 0.05, 4),
    rotation: ((t.rotation % 360) + 360) % 360,
    zIndex: Math.round(t.zIndex),
  };
}

export function toManifestTransform(t: ElementTransform | undefined) {
  if (!t) return undefined;
  const r = resolveTransform(t);
  if (isNearIdentity(r)) return undefined;
  return {
    x: Number(r.x.toFixed(3)),
    y: Number(r.y.toFixed(3)),
    scaleX: Number(r.scaleX.toFixed(4)),
    scaleY: Number(r.scaleY.toFixed(4)),
    rotation: Number(r.rotation.toFixed(2)),
    zIndex: r.zIndex,
  };
}
