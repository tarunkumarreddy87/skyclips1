"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, ImagePlus, Pencil, ChevronUp, ChevronDown, Scissors, Sparkles, Trash2, Scan } from "lucide-react";
import { useEditorStore } from "@/lib/editor/store";
import { removeSelectedImageBackground } from "@/lib/editor/remove-image-background";
import { cn } from "@/lib/utils";

/** Keep selection controls outside the transformed layer so they never scale or rotate. */
export function CanvasElementToolbar({ className, variant, onEdit, onFit, templateLayerId }: {
  templateLayerId?: string; className?: string; variant?: "media" | "text"; scaleCompensation?: number; onEdit?: () => void; onFit?: () => void;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 8, width: 280 });
  const item = useEditorStore(s => s.getSelectedItem());
  const locked = useEditorStore(s => s.timeline.tracks.some(t => t.locked && t.items.some(i => i.id === s.ui.selectedItemId)));
  const isStillImage = useEditorStore(s => { const selected = s.getSelectedItem(); return Boolean(selected && "assetId" in selected && s.assets.find(a => a.id === selected.assetId)?.mediaType === "image"); });
  const toggleToolPanel = useEditorStore(s => s.toggleToolPanel);
  useLayoutEffect(() => {
    const stage = anchor.current?.closest<HTMLElement>("[data-preview-stage]");
    if (!stage) return;
    // Dock selection actions in the preview gutter, outside the rendered picture.
    // The portal also keeps controls at a constant size when the layer is scaled.
    const viewport = stage.closest<HTMLElement>("[data-preview-viewport]") ?? stage;
    setHost(viewport);
    const measure = () => {
      const bounds = viewport.getBoundingClientRect();
      const width = Math.min(templateLayerId ? 232 : 328, bounds.width - 16);
      const next = { width, left: bounds.width / 2, top: 6 };
      setPosition(previous => previous.width === next.width && previous.left === next.left && previous.top === next.top ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [item?.id, templateLayerId]);
  if (!item) return null;
  const state = () => useEditorStore.getState();
  const text = variant === "text" || item.type === "text" || item.type === "captions" || item.type === "animation";
  const imageLayer = !templateLayerId || templateLayerId === "media-subject";
  const edit = () => { state().setPlaying(false); if (onEdit) onEdit(); else { state().setActiveTool("text"); toggleToolPanel(true); } };
  return <><span ref={anchor} hidden />{host && createPortal(
    <div data-element-toolbar role="toolbar" aria-label={text ? "Text formatting" : "Layer actions"}
      className={cn("pointer-events-auto absolute flex h-10 items-center justify-center gap-1 rounded-xl border border-white/10 bg-[#202124]/95 px-2 text-zinc-100 shadow-[0_8px_24px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl", className)}
      style={{ ...position, zIndex: 10000, transform: "translateX(-50%)", maxWidth: "calc(100% - 16px)" }}
      onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      {!templateLayerId && !text && item.type === "video" && item.motionTemplate && <Action label="Edit template" disabled={locked} onClick={() => { state().setPlaying(false); state().setActiveTool("text"); toggleToolPanel(true); }}><Pencil className="size-3.5" /></Action>}
      {!text && imageLayer && <Action label="Replace image" disabled={locked} onClick={() => state().setReplaceMediaOpen(true)}><ImagePlus className="size-3.5" /></Action>}
      {!text && imageLayer && <Action label="Remove background" disabled={locked} onClick={() => void removeSelectedImageBackground(item.id)}><BackgroundRemovalIcon /></Action>}
      {text ? <>
        <Action label="Edit text" disabled={locked} onClick={edit}><Pencil className="size-3.5" /></Action>
        <Action label="Text styles" disabled={locked} onClick={() => { state().setActiveTool("text"); toggleToolPanel(true); }}><Sparkles className="size-3.5" /></Action>
        {onFit && <Action label="Fit text to frame" disabled={locked} onClick={onFit}><Scan className="size-3.5" /></Action>}
      </> : !templateLayerId && <Action label="Split at playhead" disabled={locked} onClick={() => { const id = state().splitItem(item.id, state().ui.playheadMs); if (id) state().selectItem(id); }}><Scissors className="size-3.5" /></Action>}
      {!templateLayerId && <>
      <span className="mx-1 h-4 w-px bg-white/15" />
      <Action label="Bring to front" disabled={locked} onClick={() => state().bringItemToFront(item.id)}><ChevronUp className="size-4" /></Action>
      <Action label="Send to back" disabled={locked} onClick={() => state().sendItemToBack(item.id)}><ChevronDown className="size-4" /></Action>
      <span className="mx-1 h-4 w-px bg-white/15" />
      {!isStillImage && <Action label="Duplicate layer" disabled={locked} onClick={() => { const id = state().duplicateItem(item.id); if (id) state().selectItem(id); }}><Copy className="size-3.5" /></Action>}
      </>}
      <Action label="Delete layer" disabled={locked} danger onClick={() => templateLayerId ? window.dispatchEvent(new CustomEvent("hanuman-template-layer-edit", {detail: {clipId: item.id, layerId: templateLayerId, patch: {hidden: true}}})) : state().deleteItem(item.id)}><Trash2 className="size-3.5" /></Action>
    </div>, host)}</>;
}

function Action({ label, onClick, children, disabled, danger }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; danger?: boolean }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}
    className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-100 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-30", danger && "text-red-400 hover:bg-red-500/15")}>{children}</button>;
}

/** Image cutout over transparency, with an eraser at the lower corner. */
function BackgroundRemovalIcon() {
  return <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5" />
    <path d="M7 3v4H3m8-4v4h4V3m6 4h-6v4h6M3 11h4v4H3" opacity=".4" />
    <circle cx="9" cy="9" r="1.5" />
    <path d="m4 19 5-6 3 3" />
    <path d="m14 21-3-3a1.4 1.4 0 0 1 0-2l6-6a1.4 1.4 0 0 1 2 0l3 3a1.4 1.4 0 0 1 0 2l-6 6h-2Zm1-9 5 5M16 21h6" />
  </svg>;
}
