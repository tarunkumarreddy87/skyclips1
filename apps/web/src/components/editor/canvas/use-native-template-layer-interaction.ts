"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { EditorialARollTemplate } from "@hanuman/shared-types";

/** Editor chrome lives outside scene markup and never changes rendered content. */
export function useNativeTemplateLayerInteraction(host: RefObject<HTMLDivElement | null>, template: EditorialARollTemplate, clipId?: string) {
  const selected = useRef<string | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    const root = host.current;
    if (!root || !clipId) return;
    const chrome = document.createElement("div");
    chrome.dataset.templateLayerControls = "";
    Object.assign(chrome.style, { position: "absolute", zIndex: "100", border: "2px solid #8b5cf6", boxSizing: "border-box", cursor: "move", display: "none", pointerEvents: "auto", touchAction: "none" });
    const deleteButton = document.createElement("button");
    deleteButton.type = "button"; deleteButton.textContent = "Delete layer";
    deleteButton.setAttribute("aria-label", "Delete selected template layer");
    Object.assign(deleteButton.style, { position: "absolute", left: "50%", top: "0", transform: "translate(-50%,-115%)", background: "#18181b", color: "white", border: "1px solid #71717a", borderRadius: "8px", font: "24px sans-serif", padding: "10px 18px", whiteSpace: "nowrap", cursor: "pointer" });
    deleteButton.addEventListener("pointerdown", event => event.stopPropagation());
    deleteButton.addEventListener("click", event => {
      event.stopPropagation();
      if (!selected.current) return;
      window.dispatchEvent(new CustomEvent("hanuman-template-layer-edit", { detail: { clipId, layerId: selected.current, patch: { hidden: true } } }));
      selected.current = null; chrome.style.display = "none";
    });
    const replaceButton = document.createElement("button");
    replaceButton.type = "button"; replaceButton.textContent = "Replace image";
    Object.assign(replaceButton.style, { position: "absolute", left: "50%", top: "-95px", background: "#18181b", color: "white", font: "24px sans-serif", padding: "10px 18px", whiteSpace: "nowrap", cursor: "pointer" });
    replaceButton.addEventListener("pointerdown", e => e.stopPropagation());
    replaceButton.addEventListener("click", e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("hanuman-template-replace", { detail: { clipId } })); });
    const removeButton = document.createElement("button");
    removeButton.type = "button"; removeButton.textContent = "Remove background";
    removeButton.style.cssText = replaceButton.style.cssText; removeButton.style.top = "-150px";
    removeButton.addEventListener("pointerdown", e => e.stopPropagation());
    removeButton.addEventListener("click", e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("hanuman-template-cutout", {detail:{clipId}})); });
    chrome.appendChild(removeButton);
    chrome.appendChild(replaceButton);
    chrome.appendChild(deleteButton);
    root.appendChild(chrome);
    const guides = document.createElement("div");
    Object.assign(guides.style, { position: "absolute", inset: "0", pointerEvents: "none", zIndex: "101" });
    const gx = document.createElement("div"), gy = document.createElement("div"), label = document.createElement("div");
    Object.assign(gx.style, { position: "absolute", top: "0", bottom: "0", borderLeft: "2px solid #ef4444", display: "none" });
    Object.assign(gy.style, { position: "absolute", left: "0", right: "0", borderTop: "2px solid #ef4444", display: "none" });
    Object.assign(label.style, { position: "absolute", bottom: "20px", left: "50%", transform: "translateX(-50%)", padding: "8px 14px", background: "#111e", color: "white", font: "24px sans-serif", display: "none" });
    guides.append(gx, gy, label); root.appendChild(guides);
    let target: HTMLElement | SVGElement | null = null;
    let disposeDrag: (() => void) | undefined;
    const locate = () => {
      target = Array.from(root.querySelectorAll<HTMLElement | SVGElement>("[data-layer-id]")).find(el => el.dataset.layerId === selected.current) ?? null;
      removeButton.style.display = selected.current === "media-subject" ? "block" : "none";
      replaceButton.style.display = selected.current === "media-subject" ? "block" : "none";
      if (!target) { chrome.style.display = "none"; return; }
      const r = root.getBoundingClientRect(), b = target.getBoundingClientRect();
      const scale = r.width / 1920;
      Object.assign(chrome.style, { display: "block", left: `${(b.left-r.left)/scale}px`, top: `${(b.top-r.top)/scale}px`, width: `${b.width/scale}px`, height: `${b.height/scale}px` });
    };
    for (const [name, left, top] of [["nw", "0%", "0%"], ["ne", "100%", "0%"], ["sw", "0%", "100%"], ["se", "100%", "100%"]]) {
      const handle = document.createElement("button");
      handle.type = "button"; handle.dataset.resize = name; handle.setAttribute("aria-label", `Resize template layer ${name}`);
      Object.assign(handle.style, { position: "absolute", left, top, width: "22px", height: "22px", transform: "translate(-50%,-50%)", borderRadius: "50%", border: "3px solid #8b5cf6", background: "white", cursor: `${name}-resize`, touchAction: "none" });
      chrome.appendChild(handle);
    }
    const choose = (event: MouseEvent) => {
      if (suppressClick.current) { suppressClick.current = false; event.stopImmediatePropagation(); return; }
      if (chrome.contains(event.target as Node)) return;
      const el = (event.target as HTMLElement).closest<HTMLElement | SVGElement>("[data-layer-id]");
      selected.current = el?.dataset.layerId ?? null;
      locate();
    };
    root.addEventListener("click", choose, true);
    const down = (event: PointerEvent) => {
      if (!target || !selected.current) return;
      const selectionEvent = new CustomEvent("hanuman-template-layer", { cancelable: true, detail: { clipId, layer: {
        id: selected.current, text: (template.layer_edits?.[selected.current]?.text ?? (selected.current === "title" ? template.title : selected.current === "subtitle" ? template.subtitle ?? "" :
          Array.from(target.querySelectorAll("text")).map(element => element.textContent ?? "").join(" "))).slice(0,1200), kind: target.querySelector("text") ? "text" : target.tagName.toLowerCase(),
      }}});
      if (!window.dispatchEvent(selectionEvent)) { selected.current = null; locate(); return; }
      suppressClick.current = true;
      event.preventDefault(); event.stopPropagation();
      const element = target, id = selected.current;
      const initial = template.layer_edits?.[id] ?? {};
      const rect = element.getBoundingClientRect(), scale = root.getBoundingClientRect().width/1920;
      const width = rect.width/scale, height = rect.height/scale;
      const hostRect = root.getBoundingClientRect();
      const centerX = (rect.left-hostRect.left)/scale+width/2;
      const centerY = (rect.top-hostRect.top)/scale+height/2;
      const snap = (center: number, extent: number, size: number) => {
        const candidates = [{value:size/2,line:size/2}, {value:extent/2,line:0}, {value:size-extent/2,line:size}];
        const closest = candidates.sort((a,b)=>Math.abs(a.value-center)-Math.abs(b.value-center))[0];
        return Math.abs(closest.value-center)*scale <= 6 ? closest : {value:center,line:null};
      };
      if (width < 1 || height < 1) return;
      const startX = event.clientX, startY = event.clientY;
      const corner = (event.target as HTMLElement).dataset.resize;
      let patch = { x: initial.x ?? 0, y: initial.y ?? 0, scaleX: initial.scaleX ?? 1, scaleY: initial.scaleY ?? 1 };
      const move = (e: PointerEvent) => {
        if (e.pointerId !== event.pointerId) return;
        const dx = (e.clientX-startX)/scale, dy = (e.clientY-startY)/scale;
        if (corner) {
          const signX = corner.includes("w") ? -1 : 1, signY = corner.includes("n") ? -1 : 1;
          const w = Math.max(20, width + signX*dx), h = Math.max(20, height + signY*dy);
          patch = { x: (initial.x ?? 0)+signX*(w-width)/2, y: (initial.y ?? 0)+signY*(h-height)/2, scaleX: (initial.scaleX ?? 1)*w/width, scaleY: (initial.scaleY ?? 1)*h/height };
        } else patch = { ...patch, x: (initial.x ?? 0)+dx, y: (initial.y ?? 0)+dy };
        if (!corner && !e.altKey) {
          const sx = snap(centerX+patch.x-(initial.x??0),width,1920);
          const sy = snap(centerY+patch.y-(initial.y??0),height,1080);
          patch.x += sx.value-(centerX+patch.x-(initial.x??0));
          patch.y += sy.value-(centerY+patch.y-(initial.y??0));
          gx.style.display = sx.line == null ? "none" : "block"; gx.style.left = `${sx.line??0}px`;
          gy.style.display = sy.line == null ? "none" : "block"; gy.style.top = `${sy.line??0}px`;
        } else { gx.style.display = "none"; gy.style.display = "none"; }
        label.style.display = "block";
        label.textContent = `${Math.round(width*patch.scaleX/(initial.scaleX??1))} x ${Math.round(height*patch.scaleY/(initial.scaleY??1))} px | ${Math.round(patch.scaleX*100)}% x ${Math.round(patch.scaleY*100)}%`;
        patch.x = Math.max(-3840, Math.min(3840, patch.x));
        patch.y = Math.max(-2160, Math.min(2160, patch.y));
        patch.scaleX = Math.max(0.05, Math.min(20, patch.scaleX));
        patch.scaleY = Math.max(0.05, Math.min(20, patch.scaleY));
        element.style.translate = `${patch.x}px ${patch.y}px`;
        element.style.scale = `${patch.scaleX} ${patch.scaleY}`;
        locate();
      };
      const finish = (e: PointerEvent) => {
        if (e.pointerId !== event.pointerId) return;
        disposeDrag?.();
        window.dispatchEvent(new CustomEvent("hanuman-template-layer-edit", { detail: { clipId, layerId: id, patch } }));
      };
      disposeDrag = () => { gx.style.display = "none"; gy.style.display = "none"; label.style.display = "none"; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    };
    const pickAndDrag = (event: PointerEvent) => {
      if (chrome.contains(event.target as Node)) return;
      const element = (event.target as HTMLElement).closest<HTMLElement | SVGElement>("[data-layer-id]");
      if (!element) return;
      selected.current = element.dataset.layerId ?? null;
      locate();
      down(event);
    };
    root.addEventListener("pointerdown", pickAndDrag);
    chrome.addEventListener("pointerdown", down);
    chrome.addEventListener("click", e => e.stopPropagation());
    const deselect = (event: Event) => {
      if ((event as CustomEvent).detail?.clipId !== clipId) { selected.current = null; locate(); }
    };
    window.addEventListener("hanuman-editor-selection", deselect);
    const frame = requestAnimationFrame(locate);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hanuman-editor-selection", deselect); disposeDrag?.(); root.removeEventListener("click", choose, true); root.removeEventListener("pointerdown", pickAndDrag); chrome.remove(); guides.remove(); };
  }, [host, template, clipId]);
}
