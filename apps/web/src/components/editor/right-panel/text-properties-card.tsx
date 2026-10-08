"use client";

import { useEffect, useRef, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Upload } from "lucide-react";
import { CAPTION_STYLE_IDS, CAPTION_STYLE_META } from "@hanuman/shared-types";
import type { TextItem } from "@/lib/editor/types";
import { useEditorStore } from "@/lib/editor/store";
import { EDITOR_TEXT_FONTS, TEXT_MOTION_PRESETS, TEXT_STYLE_PRESETS, ensureEditorTextFontsLoaded, importLocalTextFont, resolveTextFontFamily } from "@/lib/editor/text-fonts";
import { resolveTransform } from "@/lib/editor/transform";
import { toast } from "sonner";

const field = "h-8 w-full rounded-md border border-white/15 bg-zinc-950 px-2 text-xs text-zinc-100";
const label = "flex min-w-0 flex-col gap-1.5 text-[11px] text-zinc-400";

export function TextPropertiesCard({ item }: { item: TextItem }) {
  const update = useEditorStore(s => s.updateTextItem);
  const updateTransform = useEditorStore(s => s.updateItemTransform);
  const updateAnimation = useEditorStore(s => s.updateItemAnimation);
  const settings = useEditorStore(s => s.timeline.settings);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fonts, setFonts] = useState<Array<{ id: string; label: string; family: string }>>([]);
  const t = resolveTransform(item.transform, item.position);
  const caption = item.type === "captions";
  const scalePct = Math.round(((Math.abs(t.scaleX) + Math.abs(t.scaleY)) / 2) * 100);
  useEffect(() => { ensureEditorTextFontsLoaded(); }, []);

  return <div className="space-y-4 p-3" data-text-inspector>
    <textarea aria-label="Text content" value={item.text} rows={3} className={field + " h-auto resize-y py-2"}
      style={{ fontFamily: resolveTextFontFamily(item.fontFamily) }}
      onChange={e => update(item.id, { text: e.target.value, label: e.target.value.slice(0, 40) || "Text" })} />
    {caption && <label className={label}>Caption style
      <select aria-label="Caption style" className={field} value={settings.captionStyle}
        onChange={e => useEditorStore.getState().updateSettings({ captionStyle: e.target.value as typeof settings.captionStyle })}>
        {CAPTION_STYLE_IDS.map(id => <option key={id} value={id}>{CAPTION_STYLE_META[id].label}</option>)}
      </select>
    </label>}
    <label className={label}>Text style
      <select aria-label="Text style" className={field} value={item.stylePreset}
        onChange={e => {
          const preset = TEXT_STYLE_PRESETS.find(p => p.id === e.target.value);
          if (preset) update(item.id, { stylePreset: preset.id, fontFamily: preset.fontFamily, fontWeight: preset.fontWeight, color: preset.color, fontSize: preset.fontSize });
        }}>
        <option value="default">Custom</option>
        {TEXT_STYLE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </label>
    <div className="flex items-end gap-2">
      <label className={label + " flex-1"}>Font
        <select aria-label="Font family" className={field} value={item.fontFamily || "system"} onChange={e => update(item.id, { fontFamily: e.target.value })}>
          {[...EDITOR_TEXT_FONTS, ...fonts].map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </label>
      <button type="button" title="Import font" className="flex size-8 shrink-0 items-center justify-center rounded-md border border-white/15" onClick={() => fileRef.current?.click()}><Upload className="size-4" /></button>
      <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={async e => {
        const file = e.target.files?.[0]; e.currentTarget.value = ""; if (!file) return;
        try { const font = await importLocalTextFont(file); setFonts(prev => [...prev.filter(f => f.id !== font.id), font]); update(item.id, { fontFamily: font.id }); }
        catch { toast.error("Could not load font"); }
      }} />
    </div>
    <div className="grid grid-cols-2 gap-2">
      <label className={label}>Size<input aria-label="Font size" type="number" min={14} max={64} value={item.fontSize} className={field}
        onChange={e => { const v = e.currentTarget.valueAsNumber; if (Number.isFinite(v)) update(item.id, { fontSize: Math.max(14, Math.min(64, v)) }); }} /></label>
      <label className={label}>Weight<select aria-label="Font weight" className={field} value={item.fontWeight} onChange={e => update(item.id, { fontWeight: e.target.value })}>
        {["400", "500", "600", "700", "800", "900"].map(w => <option key={w} value={w}>{w}</option>)}
      </select></label>
    </div>
    <div className="flex items-center gap-2">
      <input aria-label="Text color" type="color" value={/^#[0-9a-f]{6}$/i.test(item.color) ? item.color : "#ffffff"} onChange={e => update(item.id, { color: e.target.value })} className="size-8 shrink-0 cursor-pointer bg-transparent" />
      <input aria-label="Text color hex" value={item.color} className={field} onChange={e => update(item.id, { color: e.target.value })} />
      {([{ alignment: "left", Icon: AlignLeft }, { alignment: "center", Icon: AlignCenter }, { alignment: "right", Icon: AlignRight }] as const).map(({ alignment, Icon }) =>
        <button type="button" title={`Align ${alignment}`} aria-pressed={item.alignment === alignment} key={alignment} onClick={() => update(item.id, { alignment })}
          className={`flex size-8 shrink-0 items-center justify-center rounded-md ${item.alignment === alignment ? "bg-sky-600 text-white" : "bg-white/5"}`}><Icon className="size-4" /></button>)}
    </div>
    <div className="grid grid-cols-2 gap-2">
      {(["x", "y", "rotation"] as const).map(key => <label className={label} key={key}>{key === "rotation" ? "Rotation" : key.toUpperCase() + " %"}
        <input aria-label={key === "rotation" ? "Text rotation" : `Text ${key.toUpperCase()} position`} type="number" value={Math.round(t[key] * 10) / 10} className={field}
          onChange={e => { const v = e.currentTarget.valueAsNumber; if (Number.isFinite(v)) updateTransform(item.id, { ...t, [key]: v }); }} />
      </label>)}
      <label className={label}>Scale %<input aria-label="Text scale" type="number" min={35} max={350} step={1} value={scalePct} className={field}
        onChange={e => { const v = e.currentTarget.valueAsNumber; if (Number.isFinite(v)) { const scale = Math.max(35, Math.min(350, v)) / 100; updateTransform(item.id, { ...t, scaleX: Math.sign(t.scaleX || 1) * scale, scaleY: Math.sign(t.scaleY || 1) * scale }); } }} /></label>
      <label className={label}>Width %<input aria-label="Text box width" type="number" min={18} max={88} value={item.boxWidthPct ?? (caption ? 72 : 56)} className={field}
        onChange={e => { const v = e.currentTarget.valueAsNumber; if (Number.isFinite(v)) update(item.id, { boxWidthPct: Math.max(18, Math.min(88, v)) }); }} /></label>
    </div>
    <button type="button" className="h-8 rounded-md border border-white/15 px-2 text-xs text-zinc-200 hover:bg-white/5"
      aria-label="Center text in frame" onClick={() => updateTransform(item.id, { ...t, x: 50, y: 50 })}>Center in frame</button>
    <div className="grid grid-cols-2 gap-2">
      {(["in", "out"] as const).map(edge => <label className={label} key={edge}>{edge === "in" ? "Entrance" : "Exit"}
        <select aria-label={edge === "in" ? "Text entrance" : "Text exit"} className={field} value={item.animation?.[edge]?.preset ?? "none"}
          onChange={e => updateAnimation(item.id, { ...item.animation, [edge]: e.target.value === "none" ? undefined : { preset: e.target.value, durationMs: 450 } })}>
          {TEXT_MOTION_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>)}
    </div>
  </div>;
}
