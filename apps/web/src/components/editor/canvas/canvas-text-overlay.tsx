"use client";

import { useEditorStore } from "@/lib/editor/store";
import type { TextItem } from "@/lib/editor/types";
import { resolveTransform } from "@/lib/editor/transform";
import { previewMotionStyle } from "@/lib/editor/preview-motion";
import { resolveTextFontFamily } from "@/lib/editor/text-fonts";
import { CaptionBurnIn } from "@/components/editor/caption-burn-in";
import { TransformHandles } from "./transform-handles";
import { CanvasElementToolbar } from "./canvas-element-toolbar";
import { cn } from "@/lib/utils";

const TEXT_SHADOW =
  "0 2px 4px rgba(0,0,0,0.85), 0 8px 28px rgba(0,0,0,0.55), 0 0 1px rgba(0,0,0,0.9)";

interface CanvasTextOverlayProps {
  item: TextItem;
  selected: boolean;
  dropShadow: boolean;
  onSelect: () => void;
}

/** CSS fallback text layer (non-Remotion). Freeform text is content-sized, not a media box. */
export function CanvasTextOverlay({ item, selected, dropShadow, onSelect }: CanvasTextOverlayProps) {
  const updateItemTransform = useEditorStore((s) => s.updateItemTransform);
  const updateTextItem = useEditorStore((s) => s.updateTextItem);
  const playheadMs = useEditorStore((s) => s.ui.playheadMs);
  const captionStyle = useEditorStore((s) => s.timeline.settings.captionStyle);
  const isCaption = item.type === "captions";
  const resolved = resolveTransform(item.transform, item.position ?? { x: 50, y: 84 });
  const transform = isCaption
    ? { ...resolved, zIndex: Math.max(20, resolved.zIndex) }
    : resolved;
  const motionStyle = previewMotionStyle(item.animation, item.startMs, item.endMs, playheadMs);
  const uniform = Math.max(0.35, Math.min(3.5, (Math.abs(transform.scaleX) + Math.abs(transform.scaleY)) / 2));
  const flipX = Math.sign(transform.scaleX) || 1;
  const flipY = Math.sign(transform.scaleY) || 1;
  const fontPx = Math.max(14, Math.round((item.fontSize || 28) * uniform));
  const boxWidthPct = Math.max(18, Math.min(88, item.boxWidthPct ?? (isCaption ? 72 : 56)));

  const boxStyle = {
    position: "absolute" as const,
    left: `${transform.x}%`,
    top: `${transform.y}%`,
    transform: `translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${flipX}, ${flipY})`,
    transformOrigin: "center center",
    width: `${boxWidthPct}%`,
    zIndex: transform.zIndex,
    overflow: "visible" as const,
  };

  return (
    <div
      className={cn("pointer-events-auto absolute z-[6]", selected && "z-[25]")}
      style={boxStyle}
      data-transform-frame
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onKeyDown={() => {}}
      role="button"
      tabIndex={0}
    >
      <div
        className={cn(
          "flex items-center justify-center",
          isCaption ? "h-full w-full items-end px-2 pb-1.5 caption-enter" : "px-1",
        )}
        style={motionStyle}
      >
        {isCaption ? (
          <CaptionBurnIn
            text={item.text}
            playheadMs={playheadMs}
            startMs={item.startMs}
            endMs={item.endMs}
            styleId={captionStyle}
            color={item.color}
            fontSize={24}
            fontWeight={item.fontWeight}
            alignment={item.alignment}
            words={item.words?.map((w) => ({
              text: w.text,
              start_sec: w.startSec,
              duration_sec: w.durationSec,
            }))}
            className="line-clamp-3 max-h-[3.6em] w-full overflow-hidden"
          />
        ) : (
          <span
            className="inline-block w-full whitespace-pre-wrap break-words px-[0.55em] py-[0.2em] leading-[1.2] tracking-tight"
            style={{
              fontSize: fontPx,
              color: item.color,
              fontWeight: item.fontWeight,
              textAlign: item.alignment,
              fontFamily: resolveTextFontFamily(item.fontFamily),
              textShadow: dropShadow ? TEXT_SHADOW : undefined,
            }}
          >
            {item.text || "Text"}
          </span>
        )}
      </div>

      {selected ? (
        <>
          <TransformHandles
            mode="text"
            transform={transform}
            boxWidthPct={boxWidthPct}
            onBoxWidthChange={(next) => updateTextItem(item.id, { boxWidthPct: next })}
            onChange={(next) => {
              const signX = Math.sign(next.scaleX) || 1;
              const signY = Math.sign(next.scaleY) || 1;
              const u = Math.max(
                0.35,
                Math.min(3.5, (Math.abs(next.scaleX) + Math.abs(next.scaleY)) / 2),
              );
              updateItemTransform(item.id, {
                ...next,
                scaleX: signX * u,
                scaleY: signY * u,
              });
            }}
          />
          <CanvasElementToolbar variant="text" />
        </>
      ) : null}
    </div>
  );
}
