import {
  getTheme, cssColorFromThemeToken, estimateWordTimings, activeWordIndex, resolveCaptionStyleId,
  type TimelineManifestV1, type CaptionClip, type Overlay, type GraphicObject,
} from "@hanuman/shared-types";
import { evaluateAnimation, applyKeyframes, easeOutCubic, type MotionState } from "./animation.js";
import { activeAt, clamp, ENGINE_VERSION } from "./timing.js";
import { renderMotionScene, safeRasterSource } from "./scenes.js";
import { renderTemplateFrame } from "./templates.js";
import { evaluateMediaFrame } from "./media.js";
import { ENGINE_SANS_FONT, ENGINE_SERIF_FONT, scriptFontFamily, resolveEngineFontFamily, escape, n, measureText, textNode } from "./text-layout.js";
export { ENGINE_SANS_FONT, ENGINE_SERIF_FONT, scriptFontFamily, resolveEngineFontFamily, measureText } from "./text-layout.js";

export interface GraphicsRenderOptions {
  width?: number;
  height?: number;
  /** Export replaces source keys with embedded raster data URIs. */
  resolveAsset?: (src: string) => string;
  /** Preview composites template plates/footage per media clip; cloud can request foregrounds here. */
  includeTemplates?: boolean;
}

function group(body: string, state: MotionState, width: number, height: number, id: string): string {
  const clipId = `reveal-${escape(id.replace(/[^A-Za-z0-9_-]/g, ""))}`;
  const reveal = state.reveal < 1 ? `<defs><clipPath id="${clipId}"><rect x="-${width / 2}" y="-${height / 2}" width="${n(width * state.reveal)}" height="${height}"/></clipPath></defs>` : "";
  return `<g data-object-id="${escape(id)}" opacity="${n(clamp(state.opacity))}" transform="translate(${n(state.x * width / 100 + state.offsetX)} ${n(state.y * height / 100 + state.offsetY)}) rotate(${n(state.rotation)}) scale(${n(state.scaleX)} ${n(state.scaleY)})">${reveal}<g${state.reveal < 1 ? ` clip-path="url(#${clipId})"` : ""}>${body}</g></g>`;
}

function splitLines(words: string[], size: number, maxWidth: number, family = ENGINE_SANS_FONT, weight = "700"): Array<{ words: string[]; start: number; width: number }> {
  const lines: Array<{ words: string[]; start: number; width: number }> = [];
  let line: string[] = []; let width = 0; let start = 0;
  for (let index = 0; index < words.length; index++) {
    const word = words[index]!;
    const advance = measureText(word, size, family, weight);
    const space = measureText(" ", size, family, weight);
    if (line.length && width + space + advance > maxWidth) {
      lines.push({ words: line, start, width }); line = []; width = 0; start = index;
    }
    if (line.length) width += space;
    line.push(word); width += advance;
  }
  if (line.length) lines.push({ words: line, start, width });
  return lines;
}

function captionSvg(caption: CaptionClip, manifest: TimelineManifestV1, timeSec: number, width: number, height: number, accent: string): string {
  const style = resolveCaptionStyleId(manifest.settings?.caption_style);
  const words = caption.words?.length ? caption.words : estimateWordTimings(caption.text, caption.start_sec, caption.duration_sec);
  const spoken = activeWordIndex(words, timeSec);
  const family = style === "editorial" ? ENGINE_SERIF_FONT : resolveEngineFontFamily(caption.style?.font_family);
  const weight = style === "editorial" ? "400" : caption.style?.font_weight ?? "700";
  const boxWidth = width * clamp(caption.style?.box_width_pct ?? 72, 18, 88) / 100;
  let size = clamp(caption.style?.font_size_px ?? 76, 32, 160);
  // Never truncate long words. Shrink only to fit the widest token into its box.
  const widest = Math.max(1, ...words.map((word) => measureText(word.text, size, family, weight)));
  size *= Math.min(1, boxWidth / widest);
  const lines = splitLines(words.map((word) => word.text), size, boxWidth, family, weight);
  // Long cues become timed two-line pages; all authored words remain visible in order.
  const activeLine = Math.max(0, lines.findIndex((line) => spoken >= line.start && spoken < line.start + line.words.length));
  const pageStart = Math.floor(activeLine / 2) * 2;
  const page = lines.slice(pageStart, pageStart + 2);
  const lineHeight = size * 1.2;
  const pageHeight = lineHeight * page.length;
  const body: string[] = [];
  const widestLine = Math.max(1, ...page.map((line) => line.width));
  if (["cinematic", "editorial", "clean_highlight", "boxed_pill"].includes(style)) {
    body.push(`<rect x="${n(-widestLine / 2 - 34)}" y="${n(-pageHeight / 2 - 22)}" width="${n(widestLine + 68)}" height="${n(pageHeight + 38)}" rx="${style === "boxed_pill" ? 28 : 14}" fill="#09090b" fill-opacity="${style === "editorial" ? 0.78 : 0.64}"/>`);
    if (style === "editorial") body.push(`<rect x="${n(-widestLine / 2 - 34)}" y="${n(-pageHeight / 2 - 22)}" width="${n(widestLine + 68)}" height="${n(pageHeight + 38)}" rx="14" fill="none" stroke="#fafafa" stroke-opacity="0.2" stroke-width="1.5"/>`);
  }
  for (let lineIndex = 0; lineIndex < page.length; lineIndex++) {
    const line = page[lineIndex]!; let x = -line.width / 2;
    const y = (lineIndex - (page.length - 1) / 2) * lineHeight + size * 0.32;
    const lineScript = scriptFontFamily(line.words.join(" "), family);
    if (lineScript !== family && line.words.every((word) => scriptFontFamily(word, lineScript) === lineScript)) {
      // Let the SVG text shaper position Indic clusters. Character advances cannot
      // predict contextual ligatures; separately positioned words would collide.
      const tokens = line.words.map((word, wordIndex) => {
        const index = line.start + wordIndex;
        const active = index === spoken; const revealed = index <= spoken;
        const emphasized = style === "clean_highlight" || style === "boxed_pill" ? active : style === "karaoke" && revealed;
        const color = emphasized ? accent : caption.style?.color ?? "#fafafa";
        return `<tspan dx="${n(wordIndex === 0 ? 0 : measureText(" ", size, lineScript, weight))}" fill="${escape(color)}" opacity="${style === "kinetic" && !revealed ? 0.3 : 1}">${escape(word)}</tspan>`;
      }).join("");
      body.push(`<text x="0" y="${n(y)}" xml:space="preserve" font-family="${escape(lineScript)}" font-size="${n(size)}" font-weight="${escape(weight)}" fill="${escape(caption.style?.color ?? "#fafafa")}" text-anchor="middle">${tokens}</text>`);
      continue;
    }
    for (let wordIndex = 0; wordIndex < line.words.length; wordIndex++) {
      const word = line.words[wordIndex]!; const absoluteIndex = line.start + wordIndex;
      const tokenWidth = measureText(word, size, family, weight);
      const active = absoluteIndex === spoken;
      const revealed = absoluteIndex <= spoken;
      const wordProgress = easeOutCubic((timeSec - (words[absoluteIndex]?.start_sec ?? caption.start_sec)) / 0.18);
      let color = caption.style?.color ?? "#fafafa";
      if ((style === "karaoke" && revealed) || (style === "clean_highlight" && active)) color = accent;
      if (style === "boxed_pill" && active) {
        body.push(`<rect x="${n(x - 10)}" y="${n(y - size * 0.87)}" width="${n(tokenWidth + 20)}" height="${n(size * 1.15)}" rx="12" fill="${escape(accent)}"/>`);
        color = "#09090b";
      }
      body.push(textNode(word, x, y + (style === "kinetic" && active ? (1 - wordProgress) * 15 : 0), size, color, {
        family, weight,
        width: tokenWidth, opacity: style === "kinetic" ? revealed ? 0.55 + 0.45 * wordProgress : 0.3 : 1,
        outline: style === "bold_static" || style === "karaoke" || style === "kinetic",
      }));
      x += tokenWidth + measureText(" ", size, family, weight) + (scriptFontFamily(word, family) !== family ? size * 0.35 : 0);
    }
  }
  const state = evaluateAnimation({ x: 50, y: 84, zIndex: 30, ...caption.transform }, caption.animation ?? {
    in: { preset: "float", duration_sec: 0.22 }, out: { preset: "fade", duration_sec: 0.12 },
  }, timeSec - caption.start_sec, caption.duration_sec);
  return group(body.join(""), state, width, height, caption.id);
}

function overlaySvg(overlay: Overlay, timeSec: number, width: number, height: number, accent: string, resolveAsset?: (src: string) => string): string {
  const local = timeSec - overlay.start_sec;
  if ((overlay.type === "generated_scene" || overlay.type === "motion_scene") && overlay.scene) {
    const t = overlay.transform;
    return `<g data-object-id="${escape(overlay.id)}" transform="translate(${n(((t?.x ?? 50) - 50) * width / 100)} ${n(((t?.y ?? 50) - 50) * height / 100)}) translate(${n(width / 2)} ${n(height / 2)}) rotate(${n(t?.rotation ?? 0)}) scale(${n(t?.scaleX ?? 1)} ${n(t?.scaleY ?? 1)}) translate(${n(-width / 2)} ${n(-height / 2)})">${renderMotionScene(overlay.scene, local * 1000, overlay.id, width, height, { resolveAsset })}</g>`;
  }
  const legacyMotionIds: Record<string, import("@hanuman/shared-types").EditorialARollTemplate["id"]> = {
    vertical_bar_chart: "vertical-bar-chart", line_chart: "line-chart", before_after_split: "before-after-split",
    news_highlight: "news-highlight", doc_callout: "doc-callout", highlight_quote: "highlight-quote", product_launch_fullscreen: "product-launch-fullscreen",
  };
  if (legacyMotionIds[overlay.type]) {
    const slots = overlay.slots ?? [];
    const frame = renderTemplateFrame({ id: legacyMotionIds[overlay.type]!, title: overlay.title ?? overlay.text ?? "", subtitle: overlay.subtitle,
      values: slots.filter(slot => slot.value != null).map(slot => ({ label: slot.label ?? slot.text ?? "", value: slot.value! })),
      elements: slots.map(slot => ({ label: slot.label ?? slot.text ?? "", detail: slot.value == null ? slot.text : String(slot.value) })),
    }, local, overlay.duration_sec);
    let body = frame.slice(frame.indexOf(">") + 1, frame.lastIndexOf("</svg>"));
    const refs = overlay.image_refs ?? [];
    if (refs.length && ["before_after_split", "news_highlight", "doc_callout", "product_launch_fullscreen"].includes(overlay.type)) {
      for (let index = 0; index < Math.min(refs.length, overlay.type === "before_after_split" ? 2 : 1); index++) {
        const src = safeRasterSource(resolveAsset ? resolveAsset(refs[index]!) : refs[index]!);
        if (src) body += `<image href="${escape(src)}" x="${overlay.type === "before_after_split" ? 190 + index * 840 : 1120}" y="${overlay.type === "before_after_split" ? 630 : 270}" width="630" height="${overlay.type === "before_after_split" ? 310 : 580}" preserveAspectRatio="xMidYMid slice" opacity="${n(easeOutCubic((local - 0.4) / 0.7))}"/>`;
      }
    }
    const motion = evaluateAnimation(overlay.transform, overlay.animation, local, overlay.duration_sec);
    return group(`<svg x="${n(-width / 2)}" y="${n(-height / 2)}" width="${n(width)}" height="${n(height)}" viewBox="0 0 1920 1080">${body}</svg>`, motion, width, height, overlay.id);
  }
  const state = evaluateAnimation(overlay.transform, overlay.animation ?? {
    in: { preset: "slide", duration_sec: 0.5 }, out: { preset: "fade", duration_sec: 0.25 },
  }, local, overlay.duration_sec);
  const size = clamp(overlay.style?.font_size_px ?? (overlay.type === "freeform_text" ? 92 : 62), 24, 240);
  const box = width * clamp(overlay.style?.box_width_pct ?? 65, 18, 88) / 100;
  const text = overlay.text ?? (overlay.type === "subscribe_cta" ? "Subscribe" : "");
  const family = resolveEngineFontFamily(overlay.style?.font_family);
  const lines = splitLines(text.split(/\s+/).filter(Boolean), size, box, family, overlay.style?.font_weight);
  const lineHeight = size * 1.15;
  const h = Math.max(size, lines.length * lineHeight);
  const w = Math.min(box, Math.max(size * 3, ...lines.map((line) => line.width)));
  const body: string[] = [];
  if (overlay.type === "chapter_title" || overlay.type === "subscribe_cta") {
    body.push(`<rect x="${n(-w / 2 - 40)}" y="${n(-h / 2 - 30)}" width="${n(w + 80)}" height="${n(h + 60)}" rx="${overlay.type === "subscribe_cta" ? 24 : 10}" fill="${overlay.type === "subscribe_cta" ? escape(accent) : "#09090b"}" fill-opacity="0.9"/>`);
    if (overlay.type === "chapter_title") body.push(`<rect x="${n(-w / 2 - 40)}" y="${n(-h / 2 - 30)}" width="5" height="${n(h + 60)}" rx="2" fill="${escape(accent)}"/>`);
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const alignment = overlay.style?.alignment ?? "center";
    const x = alignment === "left" ? -w / 2 : alignment === "right" ? w / 2 : 0;
    body.push(textNode(line.words.join(" "), x, (index - (lines.length - 1) / 2) * lineHeight + size * 0.32,
      size, overlay.style?.color ?? "#fafafa", { family, width: Math.min(line.width, box), weight: overlay.style?.font_weight ?? "700", anchor: alignment === "left" ? "start" : alignment === "right" ? "end" : "middle" }));
  }
  return group(body.join(""), state, width, height, overlay.id);
}

function safeImageSrc(src: string): string {
  return /^(?:https?:\/\/|data:image\/(?:png|jpeg|webp|gif);base64,|\/)/i.test(src) ? src : "";
}

function graphicSvg(graphic: GraphicObject, timeSec: number, width: number, height: number, accent: string, resolveAsset?: (src: string) => string): string {
  const local = timeSec - graphic.start_sec;
  const state = applyKeyframes(evaluateAnimation(graphic.transform, graphic.animation ?? {
    in: { preset: "float", duration_sec: 0.45 }, out: { preset: "fade", duration_sec: 0.25 },
  }, local, graphic.duration_sec), graphic.keyframes, local);
  const w = width * clamp(graphic.width_pct ?? (graphic.type === "bar_chart" ? 55 : 38), 1, 100) / 100;
  const h = height * clamp(graphic.height_pct ?? (graphic.type === "bar_chart" ? 54 : 44), 1, 100) / 100;
  const color = graphic.color ?? accent;
  const body: string[] = [];
  if (graphic.type === "frame") {
    const clipId = `frame-${graphic.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const inset = 12;
    body.push(`<rect x="${n(-w / 2)}" y="${n(-h / 2)}" width="${n(w)}" height="${n(h)}" rx="18" fill="#f4f4f5"/>`);
    const src = graphic.src ? safeImageSrc(resolveAsset ? resolveAsset(graphic.src) : graphic.src) : "";
    if (src) {
      body.push(`<defs><clipPath id="${clipId}"><rect x="${n(-w / 2 + inset)}" y="${n(-h / 2 + inset)}" width="${n(w - inset * 2)}" height="${n(h - inset * 2 - (graphic.text ? 52 : 0))}" rx="10"/></clipPath></defs>`);
      body.push(`<image href="${escape(src)}" x="${n(-w / 2 + inset)}" y="${n(-h / 2 + inset)}" width="${n(w - inset * 2)}" height="${n(h - inset * 2 - (graphic.text ? 52 : 0))}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`);
    } else body.push(`<rect x="${n(-w / 2 + inset)}" y="${n(-h / 2 + inset)}" width="${n(w - inset * 2)}" height="${n(h - inset * 2)}" rx="10" fill="#18181b"/>`);
    if (graphic.text) body.push(textNode(graphic.text, -w / 2 + 24, h / 2 - 23, 30, "#18181b", { width: Math.min(w - 48, measureText(graphic.text, 30)) }));
  } else if (graphic.type === "bar_chart") {
    body.push(`<rect x="${n(-w / 2)}" y="${n(-h / 2)}" width="${n(w)}" height="${n(h)}" rx="22" fill="#09090b" fill-opacity="0.92" stroke="#fafafa" stroke-opacity="0.15"/>`);
    if (graphic.text) body.push(textNode(graphic.text, -w / 2 + 38, -h / 2 + 68, 40, "#fafafa", { width: Math.min(w - 76, measureText(graphic.text, 40)) }));
    const values = (graphic.data ?? []).slice(0, 12);
    const max = Math.max(1, ...values.map((item) => Math.abs(item.value)));
    const positive = values.every((item) => item.value >= 0);
    const top = -h / 2 + (graphic.text ? 112 : 44);
    const rowHeight = (h / 2 - 32 - top) / Math.max(1, values.length);
    const labelWidth = w * 0.27;
    const plotWidth = w * 0.52;
    const zero = -w / 2 + labelWidth + 40 + (positive ? 0 : plotWidth / 2);
    body.push(`<line x1="${n(zero)}" y1="${n(top)}" x2="${n(zero)}" y2="${n(h / 2 - 30)}" stroke="#fafafa" stroke-opacity="0.24"/>`);
    for (let index = 0; index < values.length; index++) {
      const datum = values[index]!;
      const progress = easeOutCubic((local - index * 0.065) / 0.75);
      const barWidth = Math.abs(datum.value) / max * plotWidth * (positive ? 1 : 0.5) * progress;
      const y = top + index * rowHeight + rowHeight * 0.18;
      const size = clamp(rowHeight * 0.43, 18, 32);
      body.push(textNode(datum.label, -w / 2 + 26, y + rowHeight * 0.42, size, "#d4d4d8", { width: Math.min(labelWidth - 10, measureText(datum.label, size)) }));
      body.push(`<rect x="${n(datum.value < 0 ? zero - barWidth : zero)}" y="${n(y)}" width="${n(barWidth)}" height="${n(rowHeight * 0.65)}" rx="6" fill="${escape(color)}"/>`);
      body.push(textNode(String(datum.value), datum.value < 0 ? zero - barWidth - 12 : zero + barWidth + 12,
        y + rowHeight * 0.45, size, "#fafafa", { anchor: datum.value < 0 ? "end" : "start" }));
    }
  } else if (graphic.shape === "circle") {
    body.push(`<ellipse cx="0" cy="0" rx="${n(w / 2)}" ry="${n(h / 2)}" fill="${escape(color)}"/>`);
  } else body.push(`<rect x="${n(-w / 2)}" y="${n(-h / 2)}" width="${n(w)}" height="${n(h)}" rx="18" fill="${escape(color)}"/>`);
  return group(body.join(""), state, width, height, graphic.id);
}

/** Transparent, self-contained scene overlay. Same markup is used by preview and export. */
export function renderGraphicsFrame(manifest: TimelineManifestV1, timeSec: number, options: GraphicsRenderOptions = {}): string {
  const outputWidth = options.width ?? manifest.metadata.resolution.width;
  const outputHeight = options.height ?? manifest.metadata.resolution.height;
  // Authoring font sizes and offsets use a 1080p stage; lower-resolution exports
  // change raster size rather than changing typography or layout.
  const height = 1080;
  const width = 1080 * manifest.metadata.resolution.width / manifest.metadata.resolution.height;
  const accent = cssColorFromThemeToken(getTheme(manifest.settings?.theme_id).palette.accent, "#fb7185");
  const objects: Array<{ z: number; id: string; svg: string }> = [];
  if (options.includeTemplates !== false) for (const layer of evaluateMediaFrame(manifest, timeSec)) {
    if (!layer.clip.motion_template) continue;
    const frame = renderTemplateFrame(layer.clip.motion_template, layer.held ? 0 : timeSec - layer.clip.start_sec, layer.clip.duration_sec, { phase: "foreground", clipId: layer.clip.id, hasMedia: !layer.clip.src.startsWith("color:") });
    const t = layer.motion;
    const body = `<svg x="${n(-width / 2)}" y="${n(-height / 2)}" width="${n(width)}" height="${n(height)}" viewBox="0 0 1920 1080">${frame.slice(frame.indexOf(">") + 1, frame.lastIndexOf("</svg>"))}</svg>`;
    objects.push({ z: -10 + t.zIndex, id: layer.clip.id, svg: `<g opacity="${n(layer.transition.opacity)}" transform="translate(${n(layer.transition.translateXPct * width / 100)} ${n(layer.transition.translateYPct * height / 100)}) translate(${n(width / 2)} ${n(height / 2)}) scale(${n(layer.transition.scale)}) translate(${n(-width / 2)} ${n(-height / 2)})">${group(body, t, width, height, layer.clip.id)}</g>` });
  }
  for (const graphic of manifest.graphics ?? []) {
    if (activeAt(graphic, timeSec)) objects.push({ z: graphic.transform?.zIndex ?? 10, id: graphic.id,
      svg: graphicSvg(graphic, timeSec, width, height, accent, options.resolveAsset) });
  }
  for (const overlay of manifest.overlays ?? []) {
    if (activeAt(overlay, timeSec)) objects.push({ z: overlay.transform?.zIndex ?? 20, id: overlay.id,
      svg: overlaySvg(overlay, timeSec, width, height, accent, options.resolveAsset) });
  }
  if (manifest.settings?.captions_enabled !== false) {
    const caption = manifest.tracks.captions.filter((item) => activeAt(item, timeSec))
      .sort((a, b) => a.duration_sec - b.duration_sec || b.start_sec - a.start_sec || a.id.localeCompare(b.id))[0];
    if (caption) objects.push({ z: caption.transform?.zIndex ?? 30, id: caption.id,
      svg: captionSvg(caption, manifest, timeSec, width, height, accent) });
  }
  objects.sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
  const shadow = manifest.settings?.overlay_drop_shadow === true;
  const filter = shadow ? `<defs><filter id="hanuman-shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="3"/><feOffset dx="0" dy="5"/><feComponentTransfer><feFuncA type="linear" slope="0.45"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>` : "";
  const body = objects.map((object) => shadow ? `<g filter="url(#hanuman-shadow)">${object.svg}</g>` : object.svg).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${width} ${height}" data-engine="${ENGINE_VERSION}">${filter}${body}</svg>`;
}
