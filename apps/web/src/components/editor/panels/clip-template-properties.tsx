"use client";

import { useRef } from "react";
import { Play, RotateCcw } from "lucide-react";
import { DOCUMENTARY_LAYOUTS, type DocumentaryLayout, type EditorialARollTemplate } from "@hanuman/shared-types";
import { useEditorStore } from "@/lib/editor/store";
import type { ClipItem } from "@/lib/editor/types";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { TemplateChoice, TemplateNumber } from "./template-fields";
import { useTemplateLayerSelection } from "@/lib/editor/template-layer-selection";

export function ClipTemplateProperties({ item }: { item: ClipItem }) {
  const selection = useTemplateLayerSelection();
  const update = useEditorStore(s => s.updateClipMotionTemplate);
  const locked = useEditorStore(s => s.timeline.tracks.find(t => t.items.some(i => i.id === item.id))?.locked);
  const asset = useEditorStore(s => s.assets.find(a => a.id === item.assetId));
  const saveStatus = useEditorStore(s => s.ui.saveStatus);
  const initial = useRef({ id: item.id, template: item.motionTemplate });
  if (initial.current.id !== item.id) initial.current = { id: item.id, template: item.motionTemplate };
  const template = item.motionTemplate;
  if (!template) return null;
  const patch = (values: Partial<EditorialARollTemplate>) => update(item.id, { ...template, ...values });
  const style = template.title_style ?? {};
  const setStyle = (values: NonNullable<EditorialARollTemplate["title_style"]>) => patch({ title_style: { ...style, ...values } });
  const counter = template.counter;
  const chart = ["editorial-data", "vertical-bar-chart", "line-chart", "before-after-split"].includes(template.id);

  return <div className="flex flex-col gap-4 p-3" data-template-inspector>
    <div className="flex items-center justify-between gap-2">
      <div><p className="text-sm font-medium">Edit template</p><p className="text-xs text-muted-foreground" role="status">{locked ? "Unlock this track to edit" : saveStatus === "error" ? "Save failed — changes remain in this session" : saveStatus === "saved" ? "Saved to timeline" : "Changes update preview immediately"}</p></div>
      <Button variant="outline" size="icon-sm" aria-label="Replay template" onClick={() => {
        const state = useEditorStore.getState(); state.setPlaying(false); state.setPlayhead(item.startMs); state.setPlaying(true);
      }}><Play /></Button>
    </div>
    <fieldset disabled={locked} className="flex min-w-0 flex-col gap-4">
      {selection.clipId === item.id && selection.layer && <div className="space-y-3 rounded-lg border border-blue-400/40 p-3">
        <p className="text-sm font-medium">Selected layer: {selection.layer.id}</p>
        {["h1", "h2", "h3", "p", "span", "figcaption", "text"].includes(selection.layer.kind) && <>
        <Field><FieldLabel>Layer text</FieldLabel><Textarea maxLength={1200} value={template.layer_edits?.[selection.layer.id]?.text ?? selection.layer.text} onChange={e => patch({layer_edits: {...template.layer_edits, [selection.layer!.id]: {...template.layer_edits?.[selection.layer!.id], text: e.target.value}}})} /></Field>
        <TemplateNumber label="Layer font size" min={1} max={500} value={template.layer_edits?.[selection.layer.id]?.fontSize} onChange={fontSize => patch({layer_edits: {...template.layer_edits, [selection.layer!.id]: {...template.layer_edits?.[selection.layer!.id], fontSize}}})} />
        <Field><FieldLabel>Layer color</FieldLabel><Input type="color" value={template.layer_edits?.[selection.layer.id]?.color ?? "#161616"} onChange={e => patch({layer_edits: {...template.layer_edits, [selection.layer!.id]: {...template.layer_edits?.[selection.layer!.id], color: e.target.value}}})} /></Field>
        </>}
        {(["x", "y"] as const).map(axis => <TemplateNumber key={axis} label={`Layer ${axis.toUpperCase()} offset (px)`} min={axis === "x" ? -3840 : -2160} max={axis === "x" ? 3840 : 2160} value={template.layer_edits?.[selection.layer!.id]?.[axis] ?? 0} onChange={value => patch({layer_edits: {...template.layer_edits, [selection.layer!.id]: {...template.layer_edits?.[selection.layer!.id], [axis]: value}}})} />)}
        <Button variant="ghost" size="sm" onClick={() => {const edits = {...template.layer_edits}; delete edits[selection.layer!.id]; patch({layer_edits: edits});}}>Reset this layer</Button>
      </div>}
      {!template.html_template && <>
      <TemplateChoice label="Documentary layout" value={template.documentary_layout ?? "auto"}
        options={[{ value: "auto", label: "Template default" }, ...DOCUMENTARY_LAYOUTS.map(value => ({ value, label: value.replaceAll("-", " ") }))]}
        onChange={value => patch({ documentary_layout: value === "auto" ? undefined : value as DocumentaryLayout })} />
      {!!template.elements?.length && <FieldGroup>
        {template.elements.map((element, index) => <Field key={index}>
          <FieldLabel>Element {index + 1}</FieldLabel>
          <Input aria-label={`Element ${index + 1} label`} maxLength={60} value={element.label} onChange={event => patch({ elements: template.elements!.map((row, i) => i === index ? { ...row, label: event.target.value || " " } : row) })} />
          <Textarea aria-label={`Element ${index + 1} detail`} maxLength={140} value={element.detail ?? ""} onChange={event => patch({ elements: template.elements!.map((row, i) => i === index ? { ...row, detail: event.target.value } : row) })} />
        </Field>)}
      </FieldGroup>}
      </>}
      <FieldGroup>
        {([['title', 'Title', 120], ['subtitle', 'Subtitle', 190], ['eyebrow', 'Eyebrow / date', 42], ['source_label', 'Source / credit', 85]] as const).map(([key, label, max]) => <Field key={key}>
          <FieldLabel htmlFor={`template-${item.id}-${key}`}>{label}</FieldLabel>
          <Textarea id={`template-${item.id}-${key}`} rows={key === "title" || key === "subtitle" ? 3 : 1} maxLength={max} value={template[key] ?? ""} onChange={e => patch({ [key]: e.target.value })} />
        </Field>)}
      </FieldGroup>
      {!template.html_template && <><Separator />
      <p className="text-sm font-medium">Title typography</p>
      <TemplateChoice label="Font style" value={style.font_family ?? "default"} options={[
        { value: "default", label: "Template default" }, { value: "Arial, Helvetica, sans-serif", label: "Sans · Arial" },
        { value: "Georgia, 'Times New Roman', serif", label: "Editorial · Georgia" }, { value: "'Courier New', monospace", label: "Mono · Courier" },
      ]} onChange={value => setStyle({ font_family: value === "default" ? undefined : value })} />
      <FieldGroup className="grid grid-cols-2 gap-3">
        <TemplateNumber label="Size (1080p px)" value={style.font_size} placeholder="Auto" min={12} max={240} onChange={font_size => setStyle({ font_size })} />
        <TemplateChoice label="Weight" value={String(style.font_weight ?? "default")} options={[{ value: "default", label: "Default" }, ...[400,500,600,700,800,900].map(n => ({ value: String(n), label: String(n) }))]}
          onChange={v => setStyle({ font_weight: v === "default" ? undefined : Number(v) })} />
      </FieldGroup>
      <Field><FieldLabel htmlFor={`template-color-${item.id}`}>Title color</FieldLabel><Input id={`template-color-${item.id}`} type="color" value={style.color ?? (["editorial-title", "product-launch-fullscreen"].includes(template.id) ? "#f4f0e8" : "#17191a")} onChange={e => setStyle({ color: e.target.value })} /></Field>
      <TemplateChoice label="Alignment" value={style.alignment ?? "default"} options={["default", "left", "center", "right"].map(value => ({value, label: value === "default" ? "Template default" : value}))}
        onChange={v => setStyle({ alignment: v === "default" ? undefined : v as "left" | "center" | "right" })} />
      <Button variant="ghost" size="sm" onClick={() => patch({ title_style: undefined })}>Reset typography</Button>
      {chart && <>
        <Separator /><p className="text-sm font-medium">Data values</p>
        <p className="text-xs text-muted-foreground">Enter your figures and source above. Charts need at least two values.</p>
        {(template.values ?? []).map((value, index) => <FieldGroup key={index} className="grid grid-cols-2 gap-2">
          <Field><FieldLabel htmlFor={`template-value-${item.id}-${index}`}>Label {index + 1}</FieldLabel><Input id={`template-value-${item.id}-${index}`} maxLength={12} value={value.label} onChange={e => patch({ values: template.values!.map((v, i) => i === index ? { ...v, label: e.target.value } : v) })} /></Field>
          <TemplateNumber label={`Value ${index + 1}`} value={value.value} onChange={n => patch({ values: template.values!.map((v, i) => i === index ? { ...v, value: n } : v) })} />
          <Button variant="ghost" size="sm" className="col-span-2" onClick={() => patch({ values: template.values!.filter((_, i) => i !== index) })}>Remove value {index + 1}</Button>
        </FieldGroup>)}
        <Button variant="outline" size="sm" disabled={(template.values?.length ?? 0) >= 6} onClick={() => patch({ values: [...(template.values ?? []), {label: "", value: 0}] })}>Add value</Button>
      </>}
      <Separator />
      <TemplateChoice label="Clock / counter" value={counter?.format ?? "off"} options={[{value: "off", label: "Off"}, {value: "number", label: "Number counter"}, {value: "clock", label: "Clock · mm:ss"}]}
        onChange={v => patch({ counter: v === "off" ? undefined : {from: counter?.from ?? 0, to: counter?.to ?? Math.round((item.endMs - item.startMs) / 1000), prefix: counter?.prefix, suffix: counter?.suffix, format: v as "number" | "clock"} })} />
      {counter && <FieldGroup>
        <p className="text-xs text-muted-foreground">Counts from start to end over this clip. {counter.format === "clock" ? "Enter seconds; 90 displays as 01:30." : "Set equal values for a fixed number."}</p>
        <TemplateNumber label="Start value" value={counter.from} onChange={from => patch({counter: {...counter, from}})} />
        <TemplateNumber label="End value" value={counter.to} onChange={to => patch({counter: {...counter, to}})} />
        {(["prefix", "suffix"] as const).map(key => <Field key={key}><FieldLabel htmlFor={`counter-${key}-${item.id}`}>{key === "prefix" ? "Prefix" : "Suffix"}</FieldLabel><Input id={`counter-${key}-${item.id}`} maxLength={20} value={counter[key] ?? ""} onChange={e => patch({counter: {...counter, [key]: e.target.value}})} /></Field>)}
      </FieldGroup>}
      <Separator /><p className="text-sm font-medium">Image / video</p>
      <p className="text-xs text-muted-foreground">{asset?.label ?? "No source media"} · {item.mediaType}. Used in templates with a media panel.</p>
      <Button variant="outline" size="sm" onClick={() => useEditorStore.getState().setReplaceMediaOpen(true)}>Choose image or video</Button>
      <TemplateChoice label="Media fit" value={item.fitMode === "contain" ? "contain" : "cover"} options={[{value: "cover", label: "Fill panel"}, {value: "contain", label: "Fit entire image / video"}]} onChange={value => useEditorStore.getState().updateClipFitMode(item.id, value as "cover" | "contain")} />
      </>}
      {template.html_template && <>
        <p className="text-xs text-muted-foreground">Click an individual layer in the canvas to edit its text, color, size or position. Scene copy updates fields marked with data-bind. This timeline holds a snapshot of the saved template.</p>
        {template.html_template.assets.map((asset, index) => <Field key={asset.key}>
          <FieldLabel>{asset.key} · {asset.kind} URL</FieldLabel>
          <Input placeholder={asset.url.startsWith("data:") ? "Embedded upload; enter a URL to replace" : "https://…"} key={asset.url} defaultValue={asset.url.startsWith("data:") ? "" : asset.url} onBlur={e => { if (/^https?:\/\/[^\s<>"']+$/.test(e.target.value)) patch({html_template: {...template.html_template!, assets: template.html_template!.assets.map((a,i) => i === index ? {...a,url:e.target.value} : a)}}); }} />
        </Field>)}
      </>}
      <Separator />
      <Button variant="outline" size="sm" onClick={() => {
        update(item.id, initial.current.template ?? null);
      }}><RotateCcw data-icon="inline-start" />Revert template edits</Button>
      <Button variant="ghost" size="sm" onClick={() => update(item.id, null)}>Return to source footage</Button>
    </fieldset>
  </div>;
}
