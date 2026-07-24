"use client";

import { Plus, Upload } from "lucide-react";
import { useRef } from "react";
import {
  CAPTION_STYLE_IDS,
  CAPTION_STYLE_META,
  resolveCaptionStyleId,
  type CaptionStyleId,
} from "@hanuman/shared-types";
import { useEditorStore } from "@/lib/editor/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { TEXT_STYLE_PRESETS, resolveTextFontFamily } from "@/lib/editor/text-fonts";

type ImportedCaption = { text: string; startMs: number; durationMs: number };

function parseTimestamp(raw: string): number | null {
  const match = raw.trim().replace(",", ".").match(/^(?:(\d+):)?(\d{1,2}):(\d{2})\.(\d{1,3})$/);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4].padEnd(3, "0"));
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

function parseCaptionFile(source: string): ImportedCaption[] {
  const blocks = source.replace(/^\uFEFF?WEBVTT[^\n]*\n/i, "").replace(/\r/g, "").split(/\n\s*\n/);
  const cues: ImportedCaption[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const [startRaw, endRaw] = lines[timingIndex]!.split("-->").map((value) => value.trim().split(/\s+/)[0] ?? "");
    const startMs = parseTimestamp(startRaw ?? "");
    const endMs = parseTimestamp(endRaw ?? "");
    const text = lines.slice(timingIndex + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (startMs == null || endMs == null || endMs <= startMs || !text) continue;
    cues.push({ text, startMs, durationMs: endMs - startMs });
  }
  return cues;
}

export function TextToolPanel() {
  const selectedItem = useEditorStore((s) => s.getSelectedItem());
  const updateTextItem = useEditorStore((s) => s.updateTextItem);
  const updateItemAnimation = useEditorStore((s) => s.updateItemAnimation);
  const addTextOverlay = useEditorStore((s) => s.addTextOverlay);
  const captionsEnabled = useEditorStore((s) => s.timeline.settings.captionsEnabled);
  const captionStyle = useEditorStore((s) => s.timeline.settings.captionStyle);
  const toggleCaptions = useEditorStore((s) => s.toggleCaptions);
  const updateSettings = useEditorStore((s) => s.updateSettings);
  const addCaption = useEditorStore((s) => s.addCaption);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const textItem =
    selectedItem && (selectedItem.type === "text" || selectedItem.type === "captions")
      ? selectedItem
      : null;
  const isCaption = textItem?.type === "captions";
  const activeStyle = resolveCaptionStyleId(captionStyle);

  function applyStylePreset(presetId: string) {
    const preset = TEXT_STYLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const id = addTextOverlay();
    updateTextItem(id, {
      text: preset.preview,
      label: preset.label,
      fontFamily: preset.fontFamily,
      fontWeight: preset.fontWeight,
      color: preset.color,
      fontSize: preset.fontSize,
      stylePreset: preset.id,
      alignment: "center",
      boxWidthPct: 70,
    });
    if (preset.motionIn) {
      updateItemAnimation(id, {
        in: { preset: preset.motionIn, durationMs: 450 },
        out: { preset: "fade", durationMs: 300 },
      });
    }
  }

  return (
    <div className="space-y-4 p-3">
      <Button
        size="sm"
        className="w-full gap-2 bg-white/10 text-xs hover:bg-white/15"
        onClick={addTextOverlay}
      >
        <Plus className="size-3.5" />
        Basic text
      </Button>

      <div className="space-y-1.5">
        <Label className="text-xs text-zinc-500">Text presets</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {TEXT_STYLE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyStylePreset(p.id)}
              className="flex flex-col items-start gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-left transition-colors hover:border-white/25 hover:bg-white/[0.06]"
            >
              <span
                className="w-full truncate text-[11px] font-bold tracking-wide text-zinc-100"
                style={{
                  fontFamily: resolveTextFontFamily(p.fontFamily),
                  color: p.color,
                }}
              >
                {p.preview}
              </span>
              <span className="text-[9px] text-zinc-500">
                {p.label}
                {p.motionIn ? " · motion" : ""}
              </span>
            </button>
          ))}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".srt,.vtt,text/vtt,application/x-subrip,text/plain"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          try {
            const cues = parseCaptionFile(await file.text());
            if (!cues.length) {
              toast.error("No valid SRT or VTT cues found");
              return;
            }
            cues.forEach((cue) => addCaption(cue.text, cue.startMs, cue.durationMs));
            toggleCaptions(true);
            toast.success(`Imported ${cues.length} caption cues`);
          } catch {
            toast.error("Could not read caption file");
          }
        }}
      />
      <Button
        size="sm"
        variant="outline"
        className="w-full gap-2 border-sky-400/25 bg-sky-500/5 text-xs text-sky-100 hover:bg-sky-500/10"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="size-3.5" />
        Import captions (.srt / .vtt)
      </Button>
      <p className="text-[9px] leading-snug text-zinc-600">
        Caption styles apply to the whole project — preview and Remotion export share the same look.
      </p>

      <div className="flex items-center justify-between rounded-lg border border-white/10 p-2">
        <Label className="text-xs text-zinc-400">Captions</Label>
        <button
          type="button"
          className={`h-5 w-9 rounded-full transition-colors ${captionsEnabled ? "bg-blue-600" : "bg-zinc-700"}`}
          onClick={() => toggleCaptions(!captionsEnabled)}
        >
          <div
            className={`size-4 translate-x-0.5 rounded-full bg-white transition-transform ${captionsEnabled ? "translate-x-4" : ""}`}
          />
        </button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-zinc-500">Caption style</Label>
        <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-0.5">
          {CAPTION_STYLE_IDS.map((id) => {
            const meta = CAPTION_STYLE_META[id];
            const active = activeStyle === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => updateSettings({ captionStyle: id as CaptionStyleId })}
                className={cn(
                  "flex items-stretch gap-2 rounded-lg border p-1.5 text-left transition-all",
                  active
                    ? "border-sky-400/70 ring-1 ring-sky-400/35 bg-sky-500/10"
                    : "border-white/10 hover:border-white/25 bg-white/[0.03]",
                )}
              >
                <span
                  className="flex h-12 w-[4.5rem] shrink-0 items-end justify-center rounded-md px-1 pb-1.5 text-[9px] font-bold text-white"
                  style={{ background: meta.swatch }}
                >
                  Aa Bb
                </span>
                <span className="min-w-0 flex-1 py-0.5">
                  <span className="block text-[11px] font-semibold text-zinc-100">{meta.label}</span>
                  <span className="mt-0.5 block text-[9px] leading-snug text-zinc-500">
                    {meta.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {textItem ? (
        <div className="space-y-3">
          {isCaption ? (
            <p className="text-[9px] text-zinc-600">
              Editing line under playhead. Style above is project-wide.
            </p>
          ) : null}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-500">Content</Label>
            <Textarea
              value={textItem.text}
              onChange={(e) => updateTextItem(textItem.id, { text: e.target.value })}
              rows={3}
              className="border-white/10 bg-white/5 text-xs"
            />
          </div>
          {!isCaption ? <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-500">Size</Label>
              <Input
                type="number"
                value={textItem.fontSize}
                onChange={(e) =>
                  updateTextItem(textItem.id, { fontSize: Number(e.target.value) })
                }
                className="h-8 border-white/10 bg-white/5 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-500">Color</Label>
              <Input
                type="color"
                value={textItem.color}
                onChange={(e) => updateTextItem(textItem.id, { color: e.target.value })}
                className="h-8 border-white/10 bg-white/5 p-1"
              />
            </div>
          </div> : null}
          {!isCaption ? <div className="space-y-1.5">
            <Label className="text-xs text-zinc-500">Alignment</Label>
            <Select
              value={textItem.alignment}
              onValueChange={(v) =>
                v && updateTextItem(textItem.id, { alignment: v as "left" | "center" | "right" })
              }
            >
              <SelectTrigger className="h-8 border-white/10 bg-white/5 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div> : null}
        </div>
      ) : (
        <p className="text-xs text-zinc-600">
          Select a caption group on the timeline (or a text overlay) to edit copy.
        </p>
      )}
    </div>
  );
}
