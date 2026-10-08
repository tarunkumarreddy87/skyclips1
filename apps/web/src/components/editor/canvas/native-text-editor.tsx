"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useEditorStore, endGestureHistory } from "@/lib/editor/store";
import type { TextItem } from "@/lib/editor/types";
import { resolveTransform } from "@/lib/editor/transform";
import { TransformHandles } from "./transform-handles";
import { CanvasElementToolbar } from "./canvas-element-toolbar";

/** Measure the actual composition text so selection follows wrapping, fonts and preview size. */
export function NativeTextEditor({ item, selected }: { item: TextItem; selected: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cancelledRef = useRef(false);
  const [editing, setEditing] = useState(false);
  const [geometry, setGeometry] = useState<{ width: number; height: number; fontSize: number; fontFamily: string; x?: number; y?: number } | null>(null);
  const authoredTransform = resolveTransform(item.transform, item.position);
  const transform = { ...authoredTransform, ...(geometry?.x != null ? { x: geometry.x, y: geometry.y! } : {}) };
  const uniform = Math.max(0.35, Math.min(3.5, (Math.abs(transform.scaleX) + Math.abs(transform.scaleY)) / 2));
  const selector = `[data-object-id="${CSS.escape(item.id)}"], [data-editor-text-id="${CSS.escape(item.id)}"]`;

  useLayoutEffect(() => {
    const stage = frameRef.current?.closest<HTMLElement>("[data-preview-stage]");
    if (!stage) return;
    let queued = 0;
    let observed: Element | null = null;
    const measure = () => {
      queued = 0;
      const source = stage.querySelector<HTMLElement | SVGGraphicsElement>(selector);
      if (!source) return;
      if (source !== observed) { if (observed) resize.unobserve(observed); resize.observe(source); observed = source; }
      let next: { width: number; height: number; fontSize: number; fontFamily: string; x?: number; y?: number };
      if (source instanceof SVGGraphicsElement) {
        const svg = source.ownerSVGElement;
        const logicalWidth = svg?.viewBox.baseVal.width || 1920;
        const logicalHeight = svg?.viewBox.baseVal.height || 1080;
        const scale = stage.clientWidth / logicalWidth;
        const bounds = source.getBBox();
        const text = source.querySelector("text");
        const textStyle = text ? getComputedStyle(text) : null;
        const matrix = source.transform.baseVal.consolidate()?.matrix;
        next = { width: bounds.width * scale, height: bounds.height * scale,
          fontSize: parseFloat(textStyle?.fontSize || "72") * scale,
          fontFamily: textStyle?.fontFamily || "Lato",
          ...(matrix ? { x: matrix.e / logicalWidth * 100, y: matrix.f / logicalHeight * 100 } : {}) };
      } else {
        const parentWidth = source.offsetParent?.clientWidth || 1920;
        const scale = stage.clientWidth / parentWidth;
        const body = source.querySelector<HTMLElement>("[data-editor-text-body]") ?? source.querySelector<HTMLElement>("[style*='font-size']");
        const style = body ? getComputedStyle(body) : null;
        const captionPosition = source.dataset.captionLayout?.split(",").map(Number);
        next = { width: source.offsetWidth * scale, height: source.offsetHeight * scale,
          fontSize: parseFloat(style?.fontSize || "72") * scale, fontFamily: style?.fontFamily || "Lato",
          ...(captionPosition ? { x: captionPosition[0], y: captionPosition[1] } : {}) };
      }
      setGeometry(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
    };
    const schedule = () => { if (!queued) queued = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    resize.observe(stage);
    const observer = new MutationObserver(schedule);
    observer.observe(stage, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-caption-layout", "transform", "font-size"] });
    measure();
    return () => { cancelAnimationFrame(queued); resize.disconnect(); observer.disconnect(); };
  }, [selector, item.text, item.fontSize, item.fontFamily, item.boxWidthPct]);

  useEffect(() => {
    if (!editing) return;
    cancelledRef.current = false;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const edit = () => {
    const state = useEditorStore.getState();
    state.setPlaying(false);
    state.selectItem(item.id);
    setEditing(true);
  };
  const fit = () => {
    const frame = frameRef.current;
    const stage = frame?.closest<HTMLElement>("[data-preview-stage]");
    if (!frame || !stage) return;
    const box = frame.getBoundingClientRect();
    const bounds = stage.getBoundingClientRect();
    const factor = Math.min(1, bounds.width * 0.8 / Math.max(1, box.width), bounds.height * 0.8 / Math.max(1, box.height));
    const scale = Math.max(0.35, uniform * factor);
    useEditorStore.getState().updateItemTransform(item.id, { ...transform, x: 50, y: 50, scaleX: (Math.sign(transform.scaleX) || 1) * scale, scaleY: (Math.sign(transform.scaleY) || 1) * scale });
    endGestureHistory();
  };
  const style: CSSProperties = {
    position: "absolute", left: `${transform.x}%`, top: `${transform.y}%`,
    width: geometry?.width ?? `${item.boxWidthPct ?? 56}%`, height: Math.max(8, geometry?.height ?? 24),
    transform: `translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${(Math.sign(transform.scaleX) || 1) * uniform}, ${(Math.sign(transform.scaleY) || 1) * uniform})`,
    transformOrigin: "center", zIndex: selected ? 45 : Math.max(20, transform.zIndex),
  };
  return (
    <div ref={frameRef} data-transform-frame data-text-editor={item.id} role="button" tabIndex={0}
      aria-label={`Edit ${item.type === "captions" ? "caption" : "text"}: ${item.text}`}
      className="pointer-events-auto absolute touch-none" style={style}
      onPointerDown={e => { if (editing) return; e.stopPropagation(); useEditorStore.getState().selectItem(item.id); }}
      onClick={e => e.stopPropagation()} onDoubleClick={e => { e.stopPropagation(); edit(); }}
      onKeyDown={e => { if (!editing && e.key === "Enter") { e.preventDefault(); edit(); } }}>
      {editing && <>
        <style>{`${selector} { visibility: hidden !important; }`}</style>
        <textarea ref={inputRef} aria-label="Edit text on canvas" defaultValue={item.text}
          className="absolute inset-0 h-full w-full resize-none overflow-hidden border-0 bg-black/60 p-0 outline-none ring-1 ring-sky-400"
          style={{ fontFamily: geometry?.fontFamily, fontSize: geometry?.fontSize, fontWeight: item.fontWeight, color: item.color, textAlign: item.alignment, lineHeight: 1.2, padding: "0.2em 0.55em", letterSpacing: 0, touchAction: "auto" }}
          onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
          onBlur={e => { if (!cancelledRef.current) useEditorStore.getState().updateTextItem(item.id, { text: e.currentTarget.value, label: e.currentTarget.value.slice(0, 40) || "Text" }); setEditing(false); }}
          onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") { cancelledRef.current = true; e.currentTarget.blur(); } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.blur(); } }} />
      </>}
      {selected && !editing && <>
        <TransformHandles mode="text" transform={transform} boxWidthPct={item.boxWidthPct ?? (item.type === "captions" ? 72 : 56)}
          onBoxWidthChange={boxWidthPct => useEditorStore.getState().updateTextItem(item.id, { boxWidthPct })}
          onChange={next => useEditorStore.getState().updateItemTransform(item.id, next)} />
        <CanvasElementToolbar variant="text" scaleCompensation={uniform} onEdit={edit} onFit={fit} />
      </>}
    </div>
  );
}
