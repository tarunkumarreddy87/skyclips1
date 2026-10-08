"use client";

import { useEditorStore } from "@/lib/editor/store";
import type { AnimationItem } from "@/lib/editor/types";
import { EDITOR_TEXT_FONTS } from "@/lib/editor/text-fonts";
import { TemplateNumber, TemplateChoice } from "./template-fields";
import type { MotionSceneLayer } from "@hanuman/shared-types";

const field = "w-full min-w-0 rounded-md border border-white/15 bg-[#202022] px-2 py-2 text-xs text-zinc-100";
const label = "flex min-w-0 flex-col gap-1.5 text-xs text-zinc-400";

export function MotionPropertiesPanel({ item }: { item: AnimationItem }) {
  const update = useEditorStore(s => s.updateAnimationItem);
  const patchLayer = (id: string, patch: Partial<MotionSceneLayer>) => {
    if (item.scene) update(item.id, { scene: { ...item.scene, layers: item.scene.layers.map(l => l.id === id ? { ...l, ...patch } : l) } });
  };
  const style = item.textStyle ?? { fontSize: 64, color: "#ffffff", fontFamily: "inter", fontWeight: "700", alignment: "center" as const };
  return <div className="space-y-4 p-3" data-motion-inspector>
    <label className={label}>Title<textarea aria-label="Motion title" rows={3} className={field} value={item.title ?? item.label}
      onChange={e => update(item.id, { title: e.target.value, label: e.target.value })} /></label>
    <label className={label}>Subtitle<textarea aria-label="Motion subtitle" rows={2} className={field} value={item.subtitle ?? ""}
      onChange={e => update(item.id, { subtitle: e.target.value })} /></label>
    <div className="grid grid-cols-2 gap-3">
      <label className={label}>Size<input aria-label="Motion font size" className={field} type="number" min={12} max={240} value={style.fontSize}
        onChange={e => { const n = e.currentTarget.valueAsNumber; if (Number.isFinite(n)) update(item.id, { textStyle: { ...style, fontSize: Math.max(12, Math.min(240, n)) } }); }} /></label>
      <label className={label}>Color<input aria-label="Motion text color" className={field + " h-9"} type="color" value={style.color}
        onChange={e => update(item.id, { textStyle: { ...style, color: e.target.value } })} /></label>
    </div>
    <label className={label}>Font<select aria-label="Motion font" className={field} value={style.fontFamily}
      onChange={e => update(item.id, { textStyle: { ...style, fontFamily: e.target.value } })}>
      {EDITOR_TEXT_FONTS.map(font => <option key={font.id} value={font.id}>{font.label}</option>)}
    </select></label>
    {item.slots?.map((slot, index) => <div className="grid grid-cols-[1fr_76px] gap-2" key={index}>
      <label className={label}>Label {index + 1}<input className={field} value={slot.label ?? slot.text ?? ""}
        onChange={e => update(item.id, { slots: item.slots!.map((s, i) => i === index ? { ...s, text: e.target.value, label: e.target.value } : s) })} /></label>
      {typeof slot.value === "number" && <label className={label}>Value<input className={field} type="number" value={slot.value}
        onChange={e => { const value = e.currentTarget.valueAsNumber; if (Number.isFinite(value)) update(item.id, { slots: item.slots!.map((s, i) => i === index ? { ...s, value } : s) }); }} /></label>}
    </div>)}
    {item.imageRefs?.map((src, index) => <label key={index} className={label}>Image {index + 1}<input aria-label={`Motion image ${index + 1}`} className={field} value={src}
      onChange={e => update(item.id, { imageRefs: item.imageRefs!.map((s, i) => i === index ? e.target.value : s) })} /></label>)}
    {item.scene?.layers.filter(layer => layer.kind === "text" || layer.kind === "counter").map(layer => <div className="flex flex-col gap-3 rounded-lg border border-border p-3" key={layer.id}>
      <p className="text-sm font-medium">{layer.id}</p>
      {layer.kind === "text" ? <label className={label}>Text<textarea className={field} value={layer.text ?? ""} onChange={e => patchLayer(layer.id, { text: e.target.value })} /></label> : <>
        <p className="text-xs text-muted-foreground">Counter values at each animation keyframe</p>
        {layer.keyframes.map((keyframe, index) => <TemplateNumber key={index} label={`Value at ${(keyframe.timeMs / 1000).toFixed(2)}s`} value={keyframe.value ?? 0}
          onChange={value => patchLayer(layer.id, { keyframes: layer.keyframes.map((k, i) => i === index ? { ...k, value } : k) })} />)}
        {(["prefix", "suffix"] as const).map(key => <label key={key} className={label}>{key}<input className={field} value={layer[key] ?? ""} onChange={e => patchLayer(layer.id, { [key]: e.target.value })} /></label>)}
      </>}
      <TemplateChoice label="Layer font" value={layer.fontFamily} options={["sans", "serif", "mono"].map(value => ({value, label: value}))} onChange={fontFamily => patchLayer(layer.id, { fontFamily: fontFamily as MotionSceneLayer["fontFamily"] })} />
      <TemplateNumber label="Layer font size" min={12} max={240} value={layer.fontSize} onChange={fontSize => patchLayer(layer.id, {fontSize})} />
      <TemplateNumber label="Layer font weight" min={100} max={900} value={layer.fontWeight} onChange={fontWeight => patchLayer(layer.id, {fontWeight})} />
      <label className={label}>Layer color<input className={field} type="color" value={layer.color} onChange={e => patchLayer(layer.id, {color: e.target.value})} /></label>
    </div>)}
  </div>;
}
