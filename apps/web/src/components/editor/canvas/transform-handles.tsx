"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ElementTransform } from "@/lib/editor/types";
import { clampTransform } from "@/lib/editor/transform";
import { resizeGeometry } from "@/lib/editor/resize-geometry";
import { endGestureHistory } from "@/lib/editor/store";
import { cn } from "@/lib/utils";
import { RotateCw } from "lucide-react";

type Handle =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw"
  | "rotate"
  | "move";

const MOVE_DEADZONE_PX = 3;

interface TransformHandlesProps {
  transform: ElementTransform;
  onChange: (next: ElementTransform) => void;
  className?: string;
  showEdgeHandles?: boolean;
  /** Text layers: Creativly-style yellow frame + circular handles + rotate. */
  mode?: "media" | "text";
  /** Text box width (% of frame). East/west handles adjust this (reflow), not font size. */
  boxWidthPct?: number;
  onBoxWidthChange?: (nextPct: number) => void;
}

function angleDeg(cx: number, cy: number, x: number, y: number) {
  return (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
}

function clampBoxWidth(v: number) {
  return Math.max(18, Math.min(88, v));
}

/**
 * Transform chrome — media uses Rush blue squares; text uses Creativly yellow + circles.
 * Text: E/W = box width (horizontal reflow); corners = uniform type size; drag = move x/y.
 */
export function TransformHandles({
  transform,
  onChange,
  className,
  showEdgeHandles = true,
  mode = "media",
  boxWidthPct = 56,
  onBoxWidthChange,
}: TransformHandlesProps) {
  const isText = mode === "text";
  const [guides, setGuides] = useState<{ stage: HTMLElement; x: boolean; y: boolean; edgeX?: number; edgeY?: number; width: number; height: number } | null>(null);
  const startRef = useRef<{
    handle: Handle;
    pointerX: number;
    pointerY: number;
    transform: ElementTransform;
    boxWidthPct: number;
    centerX: number;
    centerY: number;
    startAngle: number;
    stageW: number;
    stageH: number;
    frameW: number;
    frameH: number;
    moved: boolean;
  } | null>(null);
  const pendingRef = useRef<ElementTransform | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  function flushPending() {
    rafRef.current = null;
    const next = pendingRef.current;
    const width = pendingWidthRef.current;
    pendingRef.current = null;
    pendingWidthRef.current = null;
    if (next) onChange(next);
    if (width != null && onBoxWidthChange) onBoxWidthChange(width);
  }

  function queueChange(next: ElementTransform) {
    pendingRef.current = next;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(flushPending);
  }

  function queueWidth(next: number) {
    pendingWidthRef.current = next;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(flushPending);
  }

  const rootRef = useRef<HTMLDivElement>(null);
  const [chromeScale, setChromeScale] = useState({ x: 1, y: 1 });
  const [measurement, setMeasurement] = useState<{ stage: HTMLElement; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const frame = rootRef.current?.closest<HTMLElement>("[data-transform-frame]");
    const stage = frame?.closest<HTMLElement>("[data-preview-stage]");
    if (!frame || !stage) return;
    // Media bakes scale into its width; text uses CSS scale. Measure the actual
    // matrix so handles stay 10 screen pixels in either representation.
    const measure = () => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(frame).transform);
      const scaleX = Math.hypot(matrix.a, matrix.b);
      const scaleY = Math.hypot(matrix.c, matrix.d);
      const chrome = { x: 1 / Math.max(0.05, scaleX), y: 1 / Math.max(0.05, scaleY) };
      setChromeScale(previous => previous.x === chrome.x && previous.y === chrome.y ? previous : chrome);
      const width = frame.offsetWidth * scaleX;
      const height = frame.offsetHeight * scaleY;
      setMeasurement(previous => previous?.stage === stage && previous.width === width && previous.height === height
        ? previous
        : { stage, width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [transform.scaleX, transform.scaleY, transform.rotation]);
  const chromeStyle = { transform: `scale(${chromeScale.x}, ${chromeScale.y})` };

  function begin(handle: Handle, e: React.PointerEvent | PointerEvent, captureEl?: HTMLElement) {
    if (e.button !== 0 || startRef.current) return;
    e.stopPropagation();
    e.preventDefault();

    const target = ("currentTarget" in e ? e.currentTarget : captureEl) as HTMLElement | null;
    const frame =
      (target?.closest("[data-transform-frame]") as HTMLElement | null) ??
      (rootRef.current?.closest("[data-transform-frame]") as HTMLElement | null);
    const stage =
      (target?.closest("[data-preview-stage]") as HTMLElement | null) ??
      (frame?.closest("[data-preview-stage]") as HTMLElement | null) ??
      frame;
    const stageRect = stage?.getBoundingClientRect();
    const frameRect = frame?.getBoundingClientRect();
    if (!stageRect || stageRect.width < 1 || stageRect.height < 1) return;

    const pivot = handle === "rotate" && frameRect ? frameRect : stageRect;
    const centerX = pivot.left + pivot.width / 2;
    const centerY = pivot.top + pivot.height / 2;
    const matrix = new DOMMatrixReadOnly(frame ? getComputedStyle(frame).transform : undefined);

    startRef.current = {
      handle,
      pointerX: e.clientX,
      pointerY: e.clientY,
      transform: { ...transform },
      boxWidthPct,
      centerX,
      centerY,
      startAngle: angleDeg(centerX, centerY, e.clientX, e.clientY) - transform.rotation,
      stageW: stageRect.width,
      stageH: stageRect.height,
      frameW: (frame?.offsetWidth || stageRect.width) * Math.hypot(matrix.a, matrix.b),
      frameH: (frame?.offsetHeight || stageRect.height) * Math.hypot(matrix.c, matrix.d),
      moved: false,
    };

    const prevUserSelect = document.body.style.userSelect;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.userSelect = "none";
    document.body.style.touchAction = "none";

    const captureTarget = captureEl ?? (target as HTMLElement | null);
    try {
      captureTarget?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      ev.preventDefault();
      const start = startRef.current;
      if (!start) return;
      const dxPx = ev.clientX - start.pointerX;
      const dyPx = ev.clientY - start.pointerY;
      const dxPct = (dxPx / start.stageW) * 100;
      const dyPct = (dyPx / start.stageH) * 100;
      const orig = start.transform;

      if (start.handle === "move") {
        if (!start.moved) {
          if (Math.hypot(dxPx, dyPx) < MOVE_DEADZONE_PX) return;
          start.moved = true;
        }
        // Pure translation — never touch scale/width (fixes “drag sideways → text grows down”).
        const x = orig.x + dxPct;
        const y = orig.y + dyPct;
        const snapX = !ev.altKey && Math.abs(x - 50) * start.stageW / 100 <= 6;
        const snapY = !ev.altKey && Math.abs(y - 50) * start.stageH / 100 <= 6;
        const halfW = start.frameW / start.stageW * 50;
        const halfH = start.frameH / start.stageH * 50;
        const edgeX = !ev.altKey && !snapX ? [0, 100].find(edge => Math.abs(x - (edge === 0 ? halfW : 100-halfW))*start.stageW/100 <= 6) : undefined;
        const edgeY = !ev.altKey && !snapY ? [0, 100].find(edge => Math.abs(y - (edge === 0 ? halfH : 100-halfH))*start.stageH/100 <= 6) : undefined;
        if (stage) setGuides({ stage, x: snapX, y: snapY, edgeX, edgeY, width: Math.round(start.frameW), height: Math.round(start.frameH) });
        queueChange(clampTransform({ ...orig, x: snapX ? 50 : edgeX != null ? (edgeX === 0 ? halfW : 100-halfW) : x, y: snapY ? 50 : edgeY != null ? (edgeY === 0 ? halfH : 100-halfH) : y }));
        return;
      }

      if (start.handle === "rotate") {
        const a = angleDeg(start.centerX, start.centerY, ev.clientX, ev.clientY);
        queueChange(clampTransform({ ...orig, rotation: a - start.startAngle }));
        return;
      }

      const h = start.handle;
      if (isText) {
        // East/west = box width (horizontal reflow). Corners = font size.
        if (h === "e" || h === "w") {
          if (!onBoxWidthChange) return;
          const resized = resizeGeometry(orig, h, dxPx, dyPx, start.frameW, start.frameH, start.stageW, start.stageH, false);
          const nextW = clampBoxWidth(start.boxWidthPct * Math.abs(resized.scaleX / orig.scaleX));
          const angle = orig.rotation * Math.PI / 180;
          const shift = (h === "e" ? 1 : -1) * (Math.sign(orig.scaleX) || 1) * start.frameW * (nextW / start.boxWidthPct - 1) / 2;
          queueChange(clampTransform({ ...orig, x: orig.x + Math.cos(angle) * shift / start.stageW * 100, y: orig.y + Math.sin(angle) * shift / start.stageH * 100 }));
          queueWidth(nextW);
          if (stage) setGuides({ stage, x: false, y: false, width: Math.round(start.frameW * nextW / start.boxWidthPct), height: Math.round(start.frameH) });
          return;
        }

        if (h === "ne" || h === "nw" || h === "se" || h === "sw") {
          const resized = resizeGeometry(orig, h, dxPx, dyPx, start.frameW, start.frameH, start.stageW, start.stageH, true, 0.35, 3.5);
          // Keep the opposite corner anchored, just like media resize.
          queueChange(clampTransform(resized));
          if (stage) setGuides({ stage, x: false, y: false, width: Math.round(start.frameW * Math.abs(resized.scaleX / orig.scaleX)), height: Math.round(start.frameH * Math.abs(resized.scaleY / orig.scaleY)) });
        }
        return;
      }

      const resized = resizeGeometry(orig, h, dxPx, dyPx, start.frameW, start.frameH, start.stageW, start.stageH, h.length === 2);
      queueChange(clampTransform(resized));
      if (stage) setGuides({ stage, x: false, y: false, width: Math.round(start.frameW * Math.abs(resized.scaleX / orig.scaleX)), height: Math.round(start.frameH * Math.abs(resized.scaleY / orig.scaleY)) });
    };

    const finish = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (pendingRef.current) {
        onChange(pendingRef.current);
        pendingRef.current = null;
      }
      if (pendingWidthRef.current != null && onBoxWidthChange) {
        onBoxWidthChange(pendingWidthRef.current);
        pendingWidthRef.current = null;
      }
      startRef.current = null;
      setGuides(null);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.touchAction = prevTouchAction;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      try {
        captureTarget?.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      endGestureHistory();
      cleanupRef.current = null;
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId === e.pointerId) finish();
    };
    cleanupRef.current = finish;

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  const corners: Handle[] = ["nw", "ne", "sw", "se"];
  // Text: only E/W mid-edges (width). Media: all four when enabled.
  const edges: Handle[] = isText ? ["e", "w"] : showEdgeHandles ? ["n", "s", "e", "w"] : [];
  const handleClass = "pointer-events-auto absolute z-40 size-2.5 touch-none rounded-full border-[1.5px] border-violet-500 bg-white shadow-sm";
  const edgeClass = "pointer-events-auto absolute z-40 h-4 w-1.5 touch-none rounded-full border-[1.5px] border-violet-500 bg-white shadow-sm";

  // Drag the selected frame itself to move — no full-bleed invisible "Move" overlay.
  useEffect(() => {
    const frame = rootRef.current?.closest("[data-transform-frame]") as HTMLElement | null;
    if (!frame) return;
    const onDown = (ev: PointerEvent) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-transform-handle]")) return;
      if (t.closest("[data-element-toolbar]")) return;
      if (t.closest("input, textarea, [contenteditable=true]")) return;
      begin("move", ev, frame);
    };
    frame.addEventListener("pointerdown", onDown);
    frame.style.cursor = "grab";
    return () => {
      frame.removeEventListener("pointerdown", onDown);
      frame.style.cursor = "";
    };
    // begin closes over latest transform — rebind when transform identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transform.x, transform.y, transform.scaleX, transform.scaleY, transform.rotation, boxWidthPct]);

  return (
    <div
      ref={rootRef}
      className={cn("pointer-events-none absolute inset-0 z-30 touch-none", className)}
      aria-hidden={false}
    >
      {guides && createPortal(
        <div aria-hidden data-alignment-guides className="pointer-events-none absolute inset-0 z-[60]">
          {guides.x && <div className="absolute inset-y-0 left-1/2 border-l border-red-500" />}
          {guides.y && <div className="absolute inset-x-0 top-1/2 border-t border-red-500" />}
          {guides.edgeX != null && <div className="absolute inset-y-0 border-l border-red-500" style={{left:`${guides.edgeX}%`}} />}
          {guides.edgeY != null && <div className="absolute inset-x-0 border-t border-red-500" style={{top:`${guides.edgeY}%`}} />}
        </div>, guides.stage)}
      <div
        style={{ borderWidth: `${chromeScale.y}px ${chromeScale.x}px` }}
        className={cn(
          "pointer-events-none absolute inset-0 rounded-none border-[1.5px] border-violet-500",
        )}
      />

      {(guides || measurement) && createPortal(
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-[61] -translate-x-1/2 rounded-md border border-white/15 bg-[#16191c]/95 px-2 py-1 text-[10px] font-medium tabular-nums text-zinc-200 shadow-lg">
          {Math.round((guides?.width ?? measurement?.width ?? 0) / (guides?.stage ?? measurement?.stage)?.clientWidth! * 1920)} × {Math.round((guides?.height ?? measurement?.height ?? 0) / (guides?.stage ?? measurement?.stage)?.clientHeight! * 1080)} px
        </div>, guides?.stage ?? measurement!.stage
      )}

      {edges.map((h) => (
        <button
          key={h}
          type="button"
          data-transform-handle
          aria-label={isText ? `Width ${h}` : `Resize ${h}`}
          style={chromeStyle}
          onPointerDown={(e) => begin(h, e)}
          className={cn(
            edgeClass,
            // Sit outside the box so mid-edge never stacks on corner handles.
            h === "n" && "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
            h === "s" && "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
            h === "e" && "right-0 top-1/2 -translate-y-1/2 translate-x-[calc(50%+2px)] cursor-ew-resize",
            h === "w" && "left-0 top-1/2 -translate-x-[calc(50%+2px)] -translate-y-1/2 cursor-ew-resize",
          )}
        />
      ))}

      {corners.map((h) => (
        <button
          key={h}
          type="button"
          data-transform-handle
          aria-label={`Scale ${h}`}
          style={chromeStyle}
          onPointerDown={(e) => begin(h, e)}
          className={cn(
            handleClass,
            h === "nw" && "left-0 top-0 -translate-x-[calc(50%+1px)] -translate-y-[calc(50%+1px)] cursor-nwse-resize",
            h === "ne" && "right-0 top-0 translate-x-[calc(50%+1px)] -translate-y-[calc(50%+1px)] cursor-nesw-resize",
            h === "sw" && "bottom-0 left-0 -translate-x-[calc(50%+1px)] translate-y-[calc(50%+1px)] cursor-nesw-resize",
            h === "se" && "bottom-0 right-0 translate-x-[calc(50%+1px)] translate-y-[calc(50%+1px)] cursor-nwse-resize",
          )}
        />
      ))}

      {/* Rotation handle — shown for all element types */}
      <button
        type="button"
        data-transform-handle
        aria-label="Rotate"
        title="Rotate"
        style={{ ...chromeStyle, transformOrigin: "top center", marginTop: 12 * chromeScale.y }}
        onPointerDown={(e) => begin("rotate", e)}
        className="pointer-events-auto absolute left-1/2 top-full z-40 mt-3 flex size-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border-[1.5px] border-violet-500 bg-white text-violet-500 shadow-sm active:cursor-grabbing"
      >
        <RotateCw className="size-3" strokeWidth={2.5} />
      </button>
    </div>
  );
}
