"use client";

import { useEffect, useRef } from "react";
import type { ElementTransform } from "@/lib/editor/types";
import { clampTransform } from "@/lib/editor/transform";
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
    moved: boolean;
  } | null>(null);
  const pendingRef = useRef<ElementTransform | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

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

  function begin(handle: Handle, e: React.PointerEvent | PointerEvent, captureEl?: HTMLElement) {
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
        queueChange(clampTransform({ ...orig, x: orig.x + dxPct, y: orig.y + dyPct }));
        return;
      }

      if (start.handle === "rotate") {
        const a = angleDeg(start.centerX, start.centerY, ev.clientX, ev.clientY);
        queueChange(clampTransform({ ...orig, rotation: a - start.startAngle }));
        return;
      }

      const h = start.handle;
      const signX = Math.sign(orig.scaleX) || 1;
      const signY = Math.sign(orig.scaleY) || 1;
      const magX = Math.abs(orig.scaleX);

      if (isText) {
        // East/west = box width (horizontal reflow). Corners = font size.
        if (h === "e" || h === "w") {
          if (!onBoxWidthChange) return;
          const delta = h === "e" ? dxPct : -dxPct;
          const nextW = clampBoxWidth(start.boxWidthPct + delta);
          // Keep visual center when resizing from the west edge.
          if (h === "w") {
            const dw = nextW - start.boxWidthPct;
            queueChange(clampTransform({ ...orig, x: orig.x + dw / 2 }));
          }
          queueWidth(nextW);
          return;
        }

        if (h === "ne" || h === "nw" || h === "se" || h === "sw") {
          const outward =
            (h.includes("e") ? dxPct / 100 : 0) +
            (h.includes("w") ? -dxPct / 100 : 0) +
            (h.includes("s") ? dyPct / 100 : 0) +
            (h.includes("n") ? -dyPct / 100 : 0);
          const nextMag = Math.max(0.35, Math.min(3.5, magX + outward / 2));
          queueChange(
            clampTransform({
              ...orig,
              scaleX: signX * nextMag,
              scaleY: signY * nextMag,
            }),
          );
        }
        return;
      }

      let scaleX = orig.scaleX;
      let scaleY = orig.scaleY;
      let x = orig.x;
      let y = orig.y;
      const sxDelta = dxPct / 100;
      const syDelta = dyPct / 100;

      if (h.includes("e")) scaleX = orig.scaleX + sxDelta;
      if (h.includes("w")) {
        scaleX = orig.scaleX - sxDelta;
        x = orig.x + dxPct / 2;
      }
      if (h.includes("s")) scaleY = orig.scaleY + syDelta;
      if (h.includes("n")) {
        scaleY = orig.scaleY - syDelta;
        y = orig.y + dyPct / 2;
      }

      if (h === "ne" || h === "nw" || h === "se" || h === "sw") {
        const avg = (Math.abs(scaleX - orig.scaleX) + Math.abs(scaleY - orig.scaleY)) / 2;
        const dirX = scaleX >= orig.scaleX ? 1 : -1;
        const dirY = scaleY >= orig.scaleY ? 1 : -1;
        scaleX = orig.scaleX + avg * dirX;
        scaleY = orig.scaleY + avg * dirY;
      }

      queueChange(clampTransform({ ...orig, x, y, scaleX, scaleY }));
    };

    const onUp = (ev: PointerEvent) => {
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
      document.body.style.userSelect = prevUserSelect;
      document.body.style.touchAction = prevTouchAction;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      try {
        (ev.target as HTMLElement | null)?.releasePointerCapture?.(ev.pointerId);
      } catch {
        /* ignore */
      }
      endGestureHistory();
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  const corners: Handle[] = ["nw", "ne", "sw", "se"];
  // Text: only E/W mid-edges (width). Media: all four when enabled.
  const edges: Handle[] = isText ? ["e", "w"] : showEdgeHandles ? ["n", "s", "e", "w"] : [];

  const handleClass = isText
    ? "pointer-events-auto absolute z-40 size-3 touch-none rounded-full border-2 border-[#EAB308] bg-white shadow-[0_1px_6px_rgba(0,0,0,0.45)]"
    : "pointer-events-auto absolute z-30 size-2.5 touch-none rounded-[1px] border border-[#3B82F6] bg-white shadow-[0_1px_5px_rgba(0,0,0,0.5)]";

  const edgeClass = isText
    ? "pointer-events-auto absolute z-40 size-3 touch-none rounded-full border-2 border-[#EAB308] bg-white shadow-[0_1px_6px_rgba(0,0,0,0.45)]"
    : "pointer-events-auto absolute z-30 size-2 touch-none rounded-[1px] border border-[#3B82F6] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.45)]";

  // Drag the selected frame itself to move — no full-bleed invisible "Move" overlay.
  useEffect(() => {
    const frame = rootRef.current?.closest("[data-transform-frame]") as HTMLElement | null;
    if (!frame) return;
    const onDown = (ev: PointerEvent) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-transform-handle]")) return;
      if (t.closest("[data-element-toolbar]")) return;
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
      <div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-none",
          isText
            ? "border-[1.5px] border-[#EAB308] shadow-[0_0_0_1px_rgba(234,179,8,0.25)]"
            : "border-[1.5px] border-[#3B82F6] shadow-[0_0_0_1px_rgba(37,99,235,0.28),0_0_14px_rgba(59,130,246,0.2)]",
        )}
      />

      {edges.map((h) => (
        <button
          key={h}
          type="button"
          data-transform-handle
          aria-label={isText ? `Width ${h}` : `Resize ${h}`}
          onPointerDown={(e) => begin(h, e)}
          className={cn(
            edgeClass,
            // Sit outside the box so mid-edge never stacks on corner handles.
            h === "n" && "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
            h === "s" && "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
            // Text: push mid-edges further out so they never stack on corner dots
            // (short one-line boxes put E and SE on top of each other otherwise).
            h === "e" &&
              (isText
                ? "right-0 top-1/2 -translate-y-1/2 translate-x-[10px] cursor-ew-resize"
                : "right-0 top-1/2 -translate-y-1/2 translate-x-[calc(50%+2px)] cursor-ew-resize"),
            h === "w" &&
              (isText
                ? "left-0 top-1/2 -translate-x-[10px] -translate-y-1/2 cursor-ew-resize"
                : "left-0 top-1/2 -translate-x-[calc(50%+2px)] -translate-y-1/2 cursor-ew-resize"),
          )}
        />
      ))}

      {corners.map((h) => (
        <button
          key={h}
          type="button"
          data-transform-handle
          aria-label={`Scale ${h}`}
          onPointerDown={(e) => begin(h, e)}
          className={cn(
            handleClass,
            h === "nw" &&
              (isText
                ? "left-0 top-0 -translate-x-[10px] -translate-y-[10px] cursor-nwse-resize"
                : "left-0 top-0 -translate-x-[calc(50%+1px)] -translate-y-[calc(50%+1px)] cursor-nwse-resize"),
            h === "ne" &&
              (isText
                ? "right-0 top-0 translate-x-[10px] -translate-y-[10px] cursor-nesw-resize"
                : "right-0 top-0 translate-x-[calc(50%+1px)] -translate-y-[calc(50%+1px)] cursor-nesw-resize"),
            h === "sw" &&
              (isText
                ? "bottom-0 left-0 -translate-x-[10px] translate-y-[10px] cursor-nesw-resize"
                : "bottom-0 left-0 -translate-x-[calc(50%+1px)] translate-y-[calc(50%+1px)] cursor-nesw-resize"),
            h === "se" &&
              (isText
                ? "bottom-0 right-0 translate-x-[10px] translate-y-[10px] cursor-nwse-resize"
                : "bottom-0 right-0 translate-x-[calc(50%+1px)] translate-y-[calc(50%+1px)] cursor-nwse-resize"),
          )}
        />
      ))}

      {isText ? (
        <button
          type="button"
          data-transform-handle
          aria-label="Rotate"
          title="Rotate"
          onPointerDown={(e) => begin("rotate", e)}
          className="pointer-events-auto absolute left-1/2 top-full z-40 mt-2.5 flex size-7 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-white/20 bg-white text-zinc-900 shadow-[0_4px_14px_rgba(0,0,0,0.45)] active:cursor-grabbing"
        >
          <RotateCw className="size-3.5" strokeWidth={2.25} />
        </button>
      ) : null}
    </div>
  );
}
