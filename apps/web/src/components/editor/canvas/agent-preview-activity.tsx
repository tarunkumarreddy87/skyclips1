"use client";
import { useEffect, useState } from "react";
import { MousePointer2, Sparkles } from "lucide-react";
import { useEditorStore } from "@/lib/editor/store";
export function AgentPreviewActivity() {
  const busy=useEditorStore(s=>s.ui.agentBusy);
  const [label,setLabel]=useState("");
  useEffect(()=>{
    let timer: ReturnType<typeof setTimeout>;
    const receive=(event:Event)=>{const detail=(event as CustomEvent).detail;setLabel(detail.label);
      document.querySelectorAll<HTMLElement>("[data-agent-item-id]").forEach(element=>{
        if(!detail.itemIds?.includes(element.dataset.agentItemId))return;
        if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches)element.animate([{boxShadow:"inset 0 0 0 2px #c4b5fd",filter:"brightness(1.3)"},{boxShadow:"inset 0 0 0 2px transparent",filter:"brightness(1)"}],{duration:1600,easing:"ease-out"});
      });
      clearTimeout(timer);timer=setTimeout(()=>setLabel(""),2500);};
    window.addEventListener("skyclip-agent-applied",receive);
    return()=>{clearTimeout(timer);window.removeEventListener("skyclip-agent-applied",receive);};
  },[]);
  if(!busy&&!label)return null;
  return <div className="pointer-events-none absolute inset-0 z-30 rounded-[inherit] ring-1 ring-inset ring-violet-400/50" aria-live="polite">
    <div className="absolute bottom-3 left-3 flex max-w-[80%] items-center gap-2 rounded-xl border border-violet-300/30 bg-zinc-950/90 px-3 py-2 text-xs text-violet-100 shadow-xl backdrop-blur-xl">
      {busy?<Sparkles className="size-3.5 motion-safe:animate-pulse"/>:<MousePointer2 className="size-3.5"/>}
      <span className="truncate">{label || "SkyClip is planning your edits"}</span>
    </div>
  </div>;
}
