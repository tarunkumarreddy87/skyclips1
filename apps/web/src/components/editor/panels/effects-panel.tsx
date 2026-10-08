"use client";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { VIDEO_FILTERS, VIDEO_EFFECTS, clipVisualFilter, type ClipVisualEffects } from "@hanuman/shared-types";
import { useEditorStore } from "@/lib/editor/store";
import { resolveMediaUrl } from "@/lib/editor/media-url";

export function EffectsPanel() {
  const item = useEditorStore(s => s.getSelectedItem());
  const assets = useEditorStore(s => s.assets);
  const update = useEditorStore(s => s.updateClipEffects);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"filters" | "effects">("filters");
  const clip = item?.type === "video" || item?.type === "broll" ? item : null;
  const asset = assets.find(a => a.id === clip?.assetId);
  const poster = resolveMediaUrl(clip?.thumbnailUrl || asset?.thumbnailUrl || (asset?.mediaType === "image" ? asset.url : ""));
  const effects = clip?.visualEffects ?? {};
  const patch = (value: ClipVisualEffects) => { if (clip) update(clip.id, value); };
  return <div className="space-y-4 p-3">
    <div className="flex items-center gap-1 border-b border-white/10 pb-2" role="tablist" aria-label="Visual treatments">
      {(["filters", "effects"] as const).map(id => <button type="button" role="tab" aria-selected={tab === id} key={id} onClick={() => setTab(id)} className={`flex-1 rounded-md py-2 text-xs capitalize ${tab === id ? "bg-white/10 text-white" : "text-zinc-500"}`}>{id}</button>)}
      <button type="button" title="Reset visual adjustments" disabled={!clip} onClick={() => patch({ filterId: "none", strength: 1, brightness: 1, contrast: 1, saturation: 1, effectId: "none", effectStrength: 0.5 })}><RotateCcw className="size-4" /></button>
    </div>
    {!clip && <p className="text-xs text-zinc-400">Select a video or image clip.</p>}
    <input aria-label="Search visual treatments" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" className="h-8 w-full rounded-md border border-white/15 bg-black/30 px-2 text-xs" />
    <div className="grid grid-cols-3 gap-2">
      {(tab === "filters" ? VIDEO_FILTERS : VIDEO_EFFECTS).filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => <button type="button" disabled={!clip} key={p.id}
        aria-pressed={(tab === "filters" ? effects.filterId ?? "none" : effects.effectId ?? "none") === p.id}
        onClick={() => patch(tab === "filters" ? { filterId: p.id } : { effectId: p.id })}
        className="overflow-hidden rounded-md border border-white/10 bg-white/5 text-left aria-pressed:border-sky-400 disabled:opacity-40">
        <div className="aspect-video overflow-hidden bg-zinc-800">{poster ? <img alt="" src={poster} className="h-full w-full object-cover" style={{ filter: clipVisualFilter({ filterId: tab === "filters" ? p.id : effects.filterId }) }} /> : <div className="flex h-full items-center justify-center text-xl text-zinc-400">Aa</div>}</div>
        <span className="block truncate px-1.5 py-2 text-[10px]">{p.name}</span>
      </button>)}
    </div>
    {clip && (tab === "filters" ? (["strength", "brightness", "contrast", "saturation"] as const) : (["effectStrength"] as const)).map(key => <label key={key} className="flex flex-col gap-2 text-[11px] capitalize text-zinc-400">
      <span className="flex justify-between">{key === "effectStrength" ? "Intensity" : key}<span>{Math.round((effects[key] ?? (key === "effectStrength" ? 0.5 : 1)) * 100)}%</span></span>
      <input aria-label={key} type="range" min={0} max={key === "strength" || key === "effectStrength" ? 1 : 2} step={0.01} value={effects[key] ?? (key === "effectStrength" ? 0.5 : 1)} onChange={e => patch({ [key]: Number(e.target.value) })} className="accent-sky-500" />
    </label>)}
  </div>;
}
