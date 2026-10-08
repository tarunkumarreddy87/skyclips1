import type { DocumentaryLayout, EditorialARollTemplate, TemplateLayerEdit } from "@hanuman/shared-types";
import { clamp } from "./timing.js";
import { easeOutCubic } from "./animation.js";
import { escape, n, measureText, resolveEngineFontFamily, textNode } from "./text-layout.js";
import { wrappedSvgText } from "./scenes.js";
import { PRESS_CUTOUT_TEMPLATE_ID } from "./press-cutout.js";

export type HtmlLayerSelection = { id: string; text: string; kind: string };
export interface TemplateRenderOptions { width?: number; height?: number; phase?: "background" | "foreground" | "complete"; clipId?: string; hasMedia?: boolean }
export const TEMPLATE_BACKGROUND_COLOR = "#edeceb";
export interface TemplateMediaSlot { x: number; y: number; width: number; height: number; opacity: number; scaleX: number; scaleY: number; offsetX: number; offsetY: number; radius: number; grayscale: boolean; hidden: boolean }
const defaults: Record<string, DocumentaryLayout> = { "editorial-title": "title", "editorial-data": "bars", "editorial-archive": "definition", "editorial-newspaper": "article", "vertical-bar-chart": "bars", "line-chart": "line", "before-after-split": "comparison", "news-highlight": "article", "doc-callout": "definition", "highlight-quote": "closing", "product-launch-fullscreen": "title" };
const paper = "#edeceb", ink = "#161616", yellow = "#f2ec00", blue = "#3e8ec0", red = "#e0574f";
const chartLayouts = ["bars", "line", "annotated-chart"];
const diagramLayouts = ["timeline", "connections", "comparison"];

export function resolveTemplateLayout(template: EditorialARollTemplate): DocumentaryLayout {
  let layout = template.documentary_layout ?? defaults[template.id] ?? "definition";
  if (chartLayouts.includes(layout) && (template.values ?? []).filter(item => Number.isFinite(item.value)).length < 2) layout = "definition";
  if (diagramLayouts.includes(layout) && (template.elements?.length ?? 0) < 2) layout = "definition";
  return layout;
}

/** HTML/JS uploads require a browser runtime and cannot be rasterized by the SVG engine. */
export function templateCapabilities(template: EditorialARollTemplate): { exact: boolean; warning?: string } {
  if (template.html_template) return { exact: true };
  return template.html_template ? { exact: false, warning: "Uploaded HTML/JavaScript animation is unsupported by the native engine. A safe documentary fallback is rendered; convert the template to declarative scene layers for export parity." } : { exact: true };
}

/** Static cloud plate, after the entrance has settled. Animated plates use renderTemplateFrame. */
export function renderTemplateBackground(template: EditorialARollTemplate, width = 1920, height = 1080, localSec = 1.5): string {
  return renderTemplateFrame(template, localSec, 10, { width, height, phase: "background" });
}

export function evaluateTemplateMediaSlot(template: EditorialARollTemplate, localSec: number, hasMedia = true): TemplateMediaSlot {
  const layout = resolveTemplateLayout(template); const subject = template.layer_edits?.["media-subject"];
  const wrap = template.layer_edits?.["object-3"];
  const progress = easeOutCubic((localSec - 0.52) / 0.7);
  return { x: 1120, y: 270, width: 630, height: 580, opacity: progress,
    scaleX: (subject?.scaleX ?? 1) * (wrap?.scaleX ?? 1), scaleY: (subject?.scaleY ?? 1) * (wrap?.scaleY ?? 1),
    offsetX: (subject?.x ?? 0) + (wrap?.x ?? 0), offsetY: (subject?.y ?? 0) + (wrap?.y ?? 0) + (1 - progress) * 32,
    radius: layout === "profile" ? 280 : 0, grayscale: layout === "profile",
    hidden: !hasMedia || layout === "title" || layout === "closing" || chartLayouts.includes(layout) || diagramLayouts.includes(layout) || Boolean(subject?.hidden || wrap?.hidden || template.html_template) };
}

function editGroup(id: string, body: string, edits: Record<string, TemplateLayerEdit> | undefined, centerX = 0, centerY = 0, animation = ""): string {
  const edit = edits?.[id]; if (edit?.hidden) return "";
  return `<g data-layer-id="${escape(id)}" transform="translate(${n(edit?.x ?? 0)} ${n(edit?.y ?? 0)}) translate(${n(centerX)} ${n(centerY)}) scale(${n(edit?.scaleX ?? 1)} ${n(edit?.scaleY ?? 1)}) translate(${n(-centerX)} ${n(-centerY)})"${animation}>${body}</g>`;
}

function templateText(template: EditorialARollTemplate, id: string, text: string, x: number, y: number, width: number, size: number,
  localSec: number, options: { family?: string; align?: "left" | "center" | "right"; delay?: number; mark?: boolean; weight?: string; color?: string } = {}): { svg: string; height: number } {
  const edit = template.layer_edits?.[id]; const value = edit?.text ?? text;
  const fontSize = clamp(edit?.fontSize ?? size, 12, 240);
  const block = wrappedSvgText(value, x, y, width, fontSize, edit?.color ?? options.color ?? ink,
    { family: resolveEngineFontFamily(options.family ?? "Lora"), align: options.align, weight: options.weight ?? "700" });
  const p = easeOutCubic((localSec - (options.delay ?? 0.2)) / 0.8);
  const markProgress = easeOutCubic((localSec - 0.55) / 0.75);
  const mark = options.mark ? block.lineWidths.map((markWidth, index) => {
    const markX = options.align === "center" ? x + (width - markWidth) / 2 : options.align === "right" ? x + width - markWidth : x;
    return `<rect x="${n(markX)}" y="${n(y + index * fontSize * 1.16 + fontSize * 0.7)}" width="${n(markWidth * markProgress)}" height="${n(fontSize * 0.25)}" fill="${yellow}"/>`;
  }).join("") : "";
  return { svg: editGroup(id, `<g transform="translate(0 ${n((1 - p) * 36)})">${mark}${block.svg}</g>`, template.layer_edits, x + width / 2, y + block.height / 2, ` opacity="${n(p)}"`), height: block.height };
}

/** Documentary templates use the same immutable SVG grammar in browser and cloud. */
export function renderTemplateFrame(template: EditorialARollTemplate, localSec: number, durationSec: number, options: TemplateRenderOptions = {}): string {
  if (template.html_template) throw new Error("Press Cutout requires its HTML/GSAP renderer; render the trusted scene before native compositing.");
  const layout = resolveTemplateLayout(template); const phase = options.phase ?? "complete";
  const background: string[] = [`<rect width="1920" height="1080" fill="${paper}"/>`]; const foreground: string[] = [];
  const edits = template.layer_edits;
  if (layout === "title") {
    const p = easeOutCubic((localSec - 0.1) / 0.9);
    background.push(editGroup("shape-circle", `<circle cx="150" cy="70" r="330" fill="${escape(edits?.["shape-circle"]?.color ?? yellow)}" transform="translate(150 70) rotate(${n(-25 * (1 - p))}) scale(${n(p)}) translate(-150 -70)"/>`, edits, 150, 70));
  }
  if (layout === "closing") {
    const p = easeOutCubic((localSec - 0.2) / 0.9);
    background.push(editGroup("shape-ring", `<circle cx="1765" cy="1045" r="365" fill="none" stroke="${ink}" stroke-width="3" stroke-dasharray="10 9" transform="translate(1765 1045) scale(${n(p)}) translate(-1765 -1045)"/>`, edits, 1765, 1045));
  }
  const slot = evaluateTemplateMediaSlot(template, localSec, options.hasMedia !== false);
  if (!slot.hidden) {
    const p = easeOutCubic((localSec - 0.3) / 0.9);
    const cx = 1435, cy = 560;
    const halo = layout === "article" ? `<rect x="1125" y="290" width="650" height="600" fill="${yellow}"/>`
      : `<ellipse cx="${cx}" cy="${cy}" rx="335" ry="310" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="9 9"/><ellipse cx="${cx}" cy="${cy}" rx="315" ry="290" fill="${yellow}"/>`;
    background.push(editGroup("object-3", editGroup("media-background", `<g transform="translate(${cx} ${cy}) scale(${n(p)}) translate(-${cx} -${cy})">${halo}</g>`, edits, cx, cy), edits, cx, cy));
  }
  const centered = layout === "title" || layout === "closing";
  const chartOrDiagram = chartLayouts.includes(layout) || diagramLayouts.includes(layout);
  const titleSize = template.title_style?.font_size ?? (Array.from(template.title).length > 75 ? 68 : Array.from(template.title).length > 42 ? 86 : 108);
  const titleWidth = centered ? 1580 : chartOrDiagram || slot.hidden ? 1550 : 850;
  const titleX = centered ? 170 : 150;
  const titleY = centered ? 350 : chartOrDiagram ? 130 : 170;
  foreground.push(templateText(template, "object-0", template.eyebrow ?? "", 150, 70, 1620, 24, localSec, { weight: "400", delay: 0.2 }).svg);
  const title = templateText(template, "title", template.title, titleX, titleY, titleWidth, chartOrDiagram ? Math.min(76, titleSize) : titleSize, localSec,
    { family: template.title_style?.font_family, weight: String(template.title_style?.font_weight ?? 700), color: template.title_style?.color, align: template.title_style?.alignment ?? (centered ? "center" : "left"), delay: 0.32, mark: true });
  foreground.push(title.svg);
  if (!chartOrDiagram) foreground.push(templateText(template, "subtitle", template.subtitle ?? "", titleX, titleY + title.height + 42, titleWidth, 34, localSec,
    { align: centered ? "center" : "left", weight: "400", delay: 0.4 }).svg);
  const elements = (template.elements ?? []).slice(0, 6); let index = 4;
  const elementIds: Array<{ title: string; detail?: string }> = [];
  for (const element of elements) { elementIds.push({ title: `object-${index++}`, ...(element.detail ? { detail: `object-${index++}` } : {}) }); }
  const links = (template.links ?? []).filter(link => Number.isInteger(link.from) && Number.isInteger(link.to) && link.from !== link.to && elements[link.from] && elements[link.to]).slice(0, 6);
  const linkIds = links.map(() => `object-${index++}`);
  const values = (template.values ?? []).filter(item => Number.isFinite(item.value)).slice(0, 6);
  const barIds = layout === "bars" ? values.map(() => `object-${index++}`) : [];
  const sourceId = `object-${index++}`; const counterId = `object-${index}`;
  if (diagramLayouts.includes(layout)) {
    const position = (i: number) => layout === "comparison" ? { x: i === 0 ? 190 : 1030, y: 410, w: 680 } : { x: 150 + i % 3 * 570, y: 390 + Math.floor(i / 3) * 290, w: 430 };
    if (layout !== "comparison") links.forEach((link, i) => {
      const from = position(link.from), to = position(link.to); const p = easeOutCubic((localSec - 0.6 - i * 0.12) / 1.5);
      foreground.push(editGroup(linkIds[i]!, `<path d="M${from.x + 205} ${from.y + 175} C${from.x + 205} ${from.y + 235},${to.x + 205} ${to.y - 65},${to.x + 205} ${to.y - 12}" fill="none" stroke="${ink}" stroke-width="3" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${n(1 - p)}"/>`, edits));
    });
    elements.slice(0, layout === "comparison" ? 2 : 6).forEach((element, i) => {
      const pos = position(i); const size = layout === "comparison" ? 62 : 37;
      if (layout === "comparison") foreground.push(`<rect x="${pos.x}" y="${pos.y}" width="680" height="8" fill="${i ? red : blue}"/>`);
      const header = templateText(template, elementIds[i]!.title, element.label, pos.x, pos.y + (layout === "comparison" ? 40 : 0), pos.w, size, localSec, { mark: true, delay: 0.5 + i * 0.12 });
      foreground.push(header.svg);
      if (element.detail) foreground.push(templateText(template, elementIds[i]!.detail!, element.detail, pos.x, pos.y + header.height + 22 + (layout === "comparison" ? 40 : 0), pos.w, layout === "comparison" ? 34 : 26, localSec, { weight: "400", delay: 0.62 + i * 0.12 }).svg);
    });
  }
  if (chartLayouts.includes(layout)) {
    const min = Math.min(0, ...values.map(item => item.value)), max = Math.max(1, ...values.map(item => item.value));
    const y = (value: number) => 840 - (value - min) / (max - min) * 450;
    const x = (i: number) => 240 + i * 1440 / Math.max(1, values.length - 1);
    for (let tick = 0; tick < 5; tick++) { const value = min + (max - min) * tick / 4; const py = y(value);
      foreground.push(`<line x1="195" x2="1740" y1="${n(py)}" y2="${n(py)}" stroke="${ink}" opacity="0.16"/>${textNode(Number(value.toPrecision(3)).toLocaleString("en-US"), 172, py + 8, 23, ink, { family: "Lora", weight: "400", anchor: "end" })}`); }
    foreground.push(`<line x1="195" x2="1740" y1="${n(y(0))}" y2="${n(y(0))}" stroke="${ink}" stroke-width="3"/>`);
    if (layout === "annotated-chart") foreground.push(`<rect x="${n(x(values.length - 1) - 80)}" y="360" width="160" height="480" fill="${yellow}" opacity="${n(easeOutCubic((localSec - 0.5) / 0.6) * 0.65)}"/>`);
    if (layout !== "bars") foreground.push(`<path d="${values.map((item, i) => `${i ? "L" : "M"}${n(x(i))},${n(y(item.value))}`).join(" ")}" fill="none" stroke="${blue}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${n(1 - easeOutCubic((localSec - 0.6) / 1.5))}"/>`);
    values.forEach((item, i) => {
      const p = easeOutCubic((localSec - 0.5 - i * 0.12) / 0.9);
      if (layout === "bars") { const py = y(0) + (y(item.value) - y(0)) * p;
        foreground.push(editGroup(barIds[i]!, `<rect x="${n(x(i) - 58)}" y="${n(Math.min(y(0), py))}" width="116" height="${n(Math.abs(y(0) - py))}" fill="${escape(edits?.[barIds[i]!]?.color ?? (i % 2 ? red : blue))}"/>`, edits, x(i), y(0))); }
      foreground.push(`<g opacity="${n(easeOutCubic((localSec - 0.5 - i * 0.12) / 0.6))}"><circle cx="${n(x(i))}" cy="${n(y(item.value))}" r="8" fill="${red}"/>${textNode(item.value.toLocaleString("en-US"), x(i), y(item.value) - 23, 26, ink, { family: "Lora", anchor: "middle" })}${textNode(item.label, x(i), 895, 23, ink, { family: "Lora", weight: "400", anchor: "middle", width: Math.min(220, measureText(item.label, 23, "Lora", "400")) })}</g>`);
    });
  }
  foreground.push(templateText(template, sourceId, template.source_label ?? "", 150, 1003, 1620, 21, localSec, { weight: "400", color: "#555555", delay: 0.64 }).svg);
  if (template.counter) {
    const counter = template.counter; const value = Math.round(counter.from + (counter.to - counter.from) * clamp(localSec / Math.max(0.001, durationSec - 1 / 30)));
    const seconds = Math.abs(value); const display = counter.format === "clock" ? `${value < 0 ? "−" : ""}${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` : value.toLocaleString("en-US");
    foreground.push(templateText(template, counterId, `${counter.prefix ?? ""}${display}${counter.suffix ?? ""}`, 1220, chartOrDiagram ? 245 : 887, 565, 48, localSec, { align: "right", delay: 0 }).svg);
  }
  const body = phase === "background" ? background.join("") : phase === "foreground" ? foreground.join("") : [...background, ...foreground].join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width ?? 1920}" height="${options.height ?? 1080}" viewBox="0 0 1920 1080" data-template-canvas="" data-template-clip="${escape(options.clipId ?? "")}"${template.html_template ? ' data-template-fallback="unsupported-html"' : ""}>${body}</svg>`;
}
