import type { MotionKeyframe, MotionScene, MotionSceneLayer } from "@hanuman/shared-types";
import { clamp } from "./timing.js";
import { escape, n, textNode, measureText, scriptFontFamily } from "./text-layout.js";

export interface SceneRenderOptions { resolveAsset?: (src: string) => string }
export function safeRasterSource(src: string): string {
  return /^(?:https?:\/\/|data:image\/(?:png|jpeg|webp|gif);base64,|\/)/i.test(src) ? src : "";
}
export function sceneEase(progress: number, easing: MotionSceneLayer["easing"], overshoot = true): number {
  const p = clamp(progress);
  if (easing === "linear") return p;
  if (easing === "spring" && overshoot) { const c = 1.15; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2; }
  return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
}

/** Channels are sampled independently, including sparse authored keyframes. */
export function sampleSceneLayer(layer: MotionSceneLayer, ms: number, property: Exclude<keyof MotionKeyframe, "timeMs">, fallback: number): number {
  const frames = layer.keyframes.filter(frame => Number.isFinite(frame.timeMs) && Number.isFinite(frame[property])).slice().sort((a, b) => a.timeMs - b.timeMs);
  if (!frames.length) return fallback;
  if (ms <= frames[0]!.timeMs) return frames[0]![property]!;
  for (let index = 1; index < frames.length; index++) {
    const right = frames[index]!; const left = frames[index - 1]!;
    if (ms <= right.timeMs) {
      const progress = sceneEase((ms - left.timeMs) / Math.max(1, right.timeMs - left.timeMs), layer.easing, property !== "opacity" && property !== "reveal");
      return left[property]! + (right[property]! - left[property]!) * progress;
    }
  }
  return frames[frames.length - 1]![property]!;
}

export function wrappedSvgText(text: string, x: number, y: number, width: number, size: number, color: string,
  options: { family?: string; weight?: string; align?: "left" | "center" | "right"; lineHeight?: number; maxLines?: number } = {}): { svg: string; height: number; lineWidths: number[] } {
  const family = scriptFontFamily(text, options.family ?? "Lato"); const weight = options.weight ?? "700";
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const token of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && measureText(`${line} ${token}`, size, family, weight) > width) { lines.push(line); line = ""; }
      // Split extremely long strings on Unicode boundaries rather than cutting them off.
      if (measureText(token, size, family, weight) > width) {
        if (line) { lines.push(line); line = ""; }
        for (const character of Array.from(token)) {
          if (line && measureText(line + character, size, family, weight) > width) { lines.push(line); line = ""; }
          line += character;
        }
      } else line += `${line ? " " : ""}${token}`;
    }
    lines.push(line);
  }
  const selected = options.maxLines ? lines.slice(0, options.maxLines) : lines;
  const lineHeight = size * (options.lineHeight ?? 1.16);
  const align = options.align ?? "left";
  const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  const tx = x + (align === "center" ? width / 2 : align === "right" ? width : 0);
  return { svg: selected.map((line, index) => textNode(line, tx, y + index * lineHeight + size * 0.82, size, color,
    { family, weight, anchor, width: Math.min(width, measureText(line, size, family, weight)) })).join(""), height: selected.length * lineHeight,
    lineWidths: selected.map(line => Math.min(width, measureText(line, size, family, weight))) };
}

/** Render model-authored data only. No scripts, HTML or browser state are executed. */
export function renderMotionScene(scene: MotionScene, localMs: number, id: string, width = 1920, height = 1080, options: SceneRenderOptions = {}): string {
  const layers: string[] = [`<rect width="${n(width)}" height="${n(height)}" fill="${escape(scene.background)}"/>`];
  for (const layer of scene.layers) {
    if (localMs < layer.startMs || localMs >= layer.endMs) continue;
    const w = Math.max(0, layer.width * width / 100); const h = Math.max(0, layer.height * height / 100);
    const x = sampleSceneLayer(layer, localMs, "x", layer.x) * width / 100; const y = sampleSceneLayer(layer, localMs, "y", layer.y) * height / 100;
    const scale = sampleSceneLayer(layer, localMs, "scale", 1); const rotate = sampleSceneLayer(layer, localMs, "rotation", 0);
    const opacity = clamp(sampleSceneLayer(layer, localMs, "opacity", 1)); const reveal = clamp(sampleSceneLayer(layer, localMs, "reveal", 1));
    const clip = `scene-${id}-${layer.id}`.replace(/[^a-zA-Z0-9_-]/g, "");
    let body = ""; const stroke = `stroke="${escape(layer.strokeColor)}" stroke-width="${n(layer.strokeWidth)}"`;
    if (layer.kind === "text" || layer.kind === "counter") {
      const value = sampleSceneLayer(layer, localMs, "value", 0);
      const text = layer.kind === "counter" ? `${layer.prefix ?? ""}${Math.round(value).toLocaleString("en-US")}${layer.suffix ?? ""}` : layer.text ?? "";
      const size = Math.max(1, Math.min(layer.fontSize, h / 1.2));
      const block = wrappedSvgText(text, -w / 2, 0, w, size, layer.color, { family: layer.fontFamily === "serif" ? "Lora" : layer.fontFamily === "mono" ? "Space Grotesk" : "Lato", weight: String(layer.fontWeight), align: layer.align });
      body = `<g transform="translate(0 ${n(-block.height / 2)})">${block.svg}</g>`;
    } else if (layer.kind === "image" && layer.src) {
      const src = safeRasterSource(options.resolveAsset ? options.resolveAsset(layer.src) : layer.src);
      if (src) body = `<image href="${escape(src)}" x="${n(-w / 2)}" y="${n(-h / 2)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="xMidYMid slice"/>`;
    } else if (layer.kind === "ellipse") body = `<ellipse cx="0" cy="0" rx="${n(w / 2)}" ry="${n(h / 2)}" fill="${escape(layer.color)}" ${stroke}/>`;
    else if (layer.kind === "line") body = `<line x1="${n(-w / 2)}" y1="0" x2="${n(w / 2)}" y2="0" stroke="${escape(layer.color)}" stroke-width="${n(Math.max(layer.strokeWidth, h))}"/>`;
    else body = `<rect x="${n(-w / 2)}" y="${n(-h / 2)}" width="${n(w)}" height="${n(h)}" rx="${n(layer.radius)}" fill="${escape(layer.color)}" ${stroke}/>`;
    const shadowId = `${clip}-shadow`;
    const shadow = layer.shadow > 0 ? `<filter id="${shadowId}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur in="SourceAlpha" stdDeviation="${n(layer.shadow / 3)}"/><feOffset dy="3"/><feComponentTransfer><feFuncA type="linear" slope="0.4"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>` : "";
    layers.push(`<g data-motion-layer="${escape(layer.id)}" transform="translate(${n(x)} ${n(y)}) rotate(${n(rotate)}) scale(${n(scale)})" opacity="${n(opacity)}"><defs><clipPath id="${clip}"><rect x="${n(-w / 2)}" y="${n(-h / 2)}" width="${n(w * reveal)}" height="${n(h)}" rx="${n(layer.kind === "ellipse" ? Math.min(w, h) / 2 : layer.radius)}"/></clipPath>${shadow}</defs><g clip-path="url(#${clip})"${shadow ? ` filter="url(#${shadowId})"` : ""}>${body}</g></g>`);
  }
  return layers.join("");
}
