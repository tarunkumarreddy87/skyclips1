"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { EditorialARollTemplate } from "@hanuman/shared-types";
import { evaluateTemplateMediaSlot, renderTemplateFrame } from "@hanuman/video-engine";
import { useNativeTemplateLayerInteraction } from "./use-native-template-layer-interaction";

export function NativeTemplateCanvas({ template, clipId, localSec, durationSec, media }: {
  template: EditorialARollTemplate; clipId: string; localSec: number; durationSec: number; media?: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null); const host = useRef<HTMLDivElement>(null); const [scale, setScale] = useState(1);
  const hasMedia = Boolean(media);
  const slot = evaluateTemplateMediaSlot(template, localSec, hasMedia);
  const background = useMemo(() => renderTemplateFrame(template, localSec, durationSec, { phase: "background", clipId, hasMedia }), [template, localSec, durationSec, clipId, hasMedia]);
  const foreground = useMemo(() => renderTemplateFrame(template, localSec, durationSec, { phase: "foreground", clipId, hasMedia }), [template, localSec, durationSec, clipId, hasMedia]);
  useNativeTemplateLayerInteraction(host, template, clipId);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setScale(Math.min(entry.contentRect.width / 1920, entry.contentRect.height / 1080)); });
    observer.observe(container.current); return () => observer.disconnect();
  }, []);
  return <div ref={container} className="absolute inset-0 overflow-hidden" style={{ pointerEvents: "auto", background: "#edeceb" }}>
    <div ref={host} data-template-canvas data-native-template={clipId} style={{ width: 1920, height: 1080, position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center" }}
      onPointerDown={event => {
        if ((event.target as Element).closest("[data-layer-id],[data-template-layer-controls]")) return;
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent("hanuman-template-drag", { detail: { clipId, clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId } }));
      }} onClick={event => {
        if ((event.target as Element).closest("[data-template-layer-controls]")) return;
        const layer = (event.target as Element).closest<SVGElement>("[data-layer-id]");
        event.stopPropagation(); window.dispatchEvent(new CustomEvent("hanuman-template-layer", { detail: { clipId,
          ...(layer ? { layer: { id: layer.dataset.layerId, text: (layer.dataset.layerId === "title" ? template.layer_edits?.title?.text ?? template.title :
            layer.dataset.layerId === "subtitle" ? template.layer_edits?.subtitle?.text ?? template.subtitle ?? "" : Array.from(layer.querySelectorAll("text")).map(text => text.textContent ?? "").join(" ")).slice(0, 1200), kind: layer.querySelector("text") ? "text" : "object" } } : {}) } }));
      }}>
      <div className="absolute inset-0" dangerouslySetInnerHTML={{ __html: background }} />
      {media ? <div data-layer-id="media-subject" style={{ display: slot.hidden ? "none" : undefined, position: "absolute", left: slot.x, top: slot.y, width: slot.width, height: slot.height,
        transform: `translate(${slot.offsetX}px, ${slot.offsetY}px) scale(${slot.scaleX}, ${slot.scaleY})`, transformOrigin: "center", opacity: slot.opacity,
        borderRadius: slot.radius, overflow: "hidden", filter: slot.grayscale ? "grayscale(1)" : undefined }}>
        {media}
      </div> : null}
      <div className="pointer-events-none absolute inset-0 [&_[data-layer-id]]:pointer-events-auto" dangerouslySetInnerHTML={{ __html: foreground }} />
    </div>
  </div>;
}
