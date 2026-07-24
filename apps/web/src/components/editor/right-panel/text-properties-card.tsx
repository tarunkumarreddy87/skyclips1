"use client";

import { useEffect, useRef, useState } from "react";
import type { AnimationPreset, ElementAnimation, TextItem } from "@/lib/editor/types";
import { useEditorStore } from "@/lib/editor/store";
import { sliderValue } from "@/lib/editor/slider-utils";
import {
  DEFAULT_ANIMATION_DURATION_MS,
} from "@/lib/editor/animation-presets";
import {
  EDITOR_TEXT_FONTS,
  TEXT_MOTION_PRESETS,
  ensureEditorTextFontsLoaded,
  fontIdFromFamily,
  importLocalTextFont,
  resolveTextFontFamily,
} from "@/lib/editor/text-fonts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { AlignCenter, AlignLeft, AlignRight, Type, Upload } from "lucide-react";
import { toast } from "sonner";

const WEIGHTS = [
  { id: "500", label: "Med" },
  { id: "600", label: "Semi" },
  { id: "700", label: "Bold" },
  { id: "800", label: "Black" },
] as const;

const POSITIONS: Array<{ id: string; label: string; x: number; y: number }> = [
  { id: "tl", label: "TL", x: 18, y: 14 },
  { id: "tc", label: "Top", x: 50, y: 14 },
  { id: "tr", label: "TR", x: 82, y: 14 },
  { id: "ml", label: "Left", x: 18, y: 50 },
  { id: "mc", label: "Center", x: 50, y: 50 },
  { id: "mr", label: "Right", x: 82, y: 50 },
  { id: "bl", label: "BL", x: 18, y: 84 },
  { id: "bc", label: "Bottom", x: 50, y: 84 },
  { id: "br", label: "BR", x: 82, y: 84 },
];

/** Premium text inspector — fonts, size, motion, position (Creativly-style). */
export function TextPropertiesCard({ item }: { item: TextItem }) {
  const updateTextItem = useEditorStore((s) => s.updateTextItem);
  const updateItemTransform = useEditorStore((s) => s.updateItemTransform);
  const updateItemAnimation = useEditorStore((s) => s.updateItemAnimation);
  const deleteItem = useEditorStore((s) => s.deleteItem);
  const fileRef = useRef<HTMLInputElement>(null);
  const [customFonts, setCustomFonts] = useState<
    Array<{ id: string; label: string; family: string }>
  >([]);
  const isCaption = item.type === "captions";
  const transform = item.transform ?? {
    x: item.position?.x ?? 50,
    y: item.position?.y ?? 50,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    zIndex: isCaption ? 20 : 12,
  };
  const fontSize = Math.max(12, Math.min(72, item.fontSize || 28));
  const activeFontId = fontIdFromFamily(item.fontFamily);
  const inPreset = item.animation?.in?.preset ?? "fade";
  const outPreset = item.animation?.out?.preset ?? "fade";

  useEffect(() => {
    ensureEditorTextFontsLoaded();
  }, []);

  function patchAnimation(edge: "in" | "out", preset: AnimationPreset) {
    const prev: ElementAnimation = item.animation ?? {};
    const durationMs = prev[edge]?.durationMs ?? DEFAULT_ANIMATION_DURATION_MS;
    const next: ElementAnimation = {
      ...prev,
      [edge]:
        preset === "none"
          ? undefined
          : { preset, durationMs: Math.max(200, durationMs) },
    };
    if (!next.in && !next.out && !next.loop) {
      updateItemAnimation(item.id, {});
      return;
    }
    updateItemAnimation(item.id, next);
  }

  async function onImportFont(file: File | undefined) {
    if (!file) return;
    try {
      const imported = await importLocalTextFont(file);
      setCustomFonts((prev) => {
        if (prev.some((f) => f.id === imported.id)) return prev;
        return [...prev, imported];
      });
      updateTextItem(item.id, { fontFamily: imported.id });
      toast.success(`Font “${imported.label}” ready`);
    } catch {
      toast.error("Could not load that font file");
    }
  }

  const fontChoices = [
    ...EDITOR_TEXT_FONTS,
    ...customFonts.map((f) => ({
      id: f.id,
      label: f.label,
      family: f.family,
      category: "custom" as const,
    })),
  ];

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
          <Type className="size-3.5" />
        </span>
        <div>
          <p className="text-xs font-semibold tracking-tight text-zinc-200">
            {isCaption ? "Caption" : "Text layer"}
          </p>
          <p className="text-[10px] text-zinc-500">
            {isCaption
              ? "Burn-in style · lower third"
              : "Drag to move · corners to size · fonts & motion below"}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wide text-zinc-500">Content</Label>
        <textarea
          value={item.text}
          rows={isCaption ? 2 : 3}
          onChange={(e) =>
            updateTextItem(item.id, {
              text: e.target.value,
              label: e.target.value.slice(0, 28) || (isCaption ? "Caption" : "Text"),
            })
          }
          className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs leading-relaxed text-zinc-100 outline-none ring-violet-500/40 placeholder:text-zinc-600 focus:ring-2"
          style={{ fontFamily: resolveTextFontFamily(item.fontFamily) }}
          placeholder={isCaption ? "Caption text…" : "Your headline…"}
        />
      </div>

      {!isCaption ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] uppercase tracking-wide text-zinc-500">Font</Label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-zinc-400 transition-colors hover:bg-white/8 hover:text-zinc-200"
              title="Import .ttf / .otf / .woff"
            >
              <Upload className="size-3" />
              Import
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
              className="hidden"
              onChange={(e) => {
                void onImportFont(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </div>
          <div className="grid max-h-36 grid-cols-2 gap-1 overflow-y-auto pr-0.5">
            {fontChoices.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => updateTextItem(item.id, { fontFamily: f.id })}
                className={cn(
                  "h-8 truncate rounded-md px-2 text-left text-[11px] transition-colors",
                  activeFontId === f.id
                    ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/40"
                    : "bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white",
                )}
                style={{ fontFamily: f.family }}
                title={f.label}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!isCaption ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase tracking-wide text-zinc-500">Size</Label>
            <span className="font-mono text-[10px] tabular-nums text-zinc-400">{fontSize}px</span>
          </div>
          <Slider
            value={[fontSize]}
            min={14}
            max={64}
            step={1}
            onValueChange={(v) => {
              const next = sliderValue(v);
              updateTextItem(item.id, { fontSize: next });
              updateItemTransform(item.id, {
                ...transform,
                scaleX: 1,
                scaleY: 1,
              });
            }}
          />
        </div>
      ) : null}

      {!isCaption ? (
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wide text-zinc-500">Weight</Label>
          <div className="grid grid-cols-4 gap-1">
            {WEIGHTS.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => updateTextItem(item.id, { fontWeight: w.id })}
                className={cn(
                  "h-7 rounded-md text-[10px] font-medium transition-colors",
                  String(item.fontWeight) === w.id
                    ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/40"
                    : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200",
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!isCaption ? (
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wide text-zinc-500">Align</Label>
          <div className="flex gap-1">
            {(
              [
                { id: "left" as const, Icon: AlignLeft },
                { id: "center" as const, Icon: AlignCenter },
                { id: "right" as const, Icon: AlignRight },
              ] as const
            ).map(({ id, Icon }) => (
              <button
                key={id}
                type="button"
                title={id}
                onClick={() => updateTextItem(item.id, { alignment: id })}
                className={cn(
                  "inline-flex h-8 flex-1 items-center justify-center rounded-md transition-colors",
                  item.alignment === id
                    ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/40"
                    : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200",
                )}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wide text-zinc-500">Color</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={item.color?.startsWith("#") ? item.color : "#ffffff"}
            onChange={(e) => updateTextItem(item.id, { color: e.target.value })}
            className="size-9 cursor-pointer rounded-lg border border-white/10 bg-transparent"
          />
          <Input
            value={item.color}
            onChange={(e) => updateTextItem(item.id, { color: e.target.value })}
            className="h-9 flex-1 border-white/10 bg-black/30 font-mono text-xs"
          />
        </div>
      </div>

      {!isCaption ? (
        <div className="space-y-2">
          <Label className="text-[10px] uppercase tracking-wide text-zinc-500">
            Text animation
          </Label>
          <p className="text-[10px] leading-snug text-zinc-600">
            In / out motion on this layer. Full set also in the Animations tool.
          </p>
          <div className="space-y-1">
            <span className="text-[10px] text-zinc-500">In</span>
            <div className="grid grid-cols-3 gap-1">
              {TEXT_MOTION_PRESETS.map((p) => (
                <button
                  key={`in-${p.id}`}
                  type="button"
                  onClick={() => patchAnimation("in", p.id as AnimationPreset)}
                  className={cn(
                    "h-7 rounded-md text-[10px] transition-colors",
                    inPreset === p.id
                      ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/40"
                      : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-zinc-500">Out</span>
            <div className="grid grid-cols-3 gap-1">
              {TEXT_MOTION_PRESETS.map((p) => {
                const outId = ("outId" in p ? p.outId : p.id) as AnimationPreset;
                const selected =
                  outPreset === outId || (p.id === "zoom_in" && outPreset === "zoom_out");
                return (
                  <button
                    key={`out-${p.id}`}
                    type="button"
                    onClick={() => patchAnimation("out", outId)}
                    className={cn(
                      "h-7 rounded-md text-[10px] transition-colors",
                      selected
                        ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/40"
                        : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200",
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {!isCaption ? (
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wide text-zinc-500">Position</Label>
          <div className="grid grid-cols-3 gap-1">
            {POSITIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  updateItemTransform(item.id, {
                    ...transform,
                    x: p.x,
                    y: p.y,
                    scaleX: 1,
                    scaleY: 1,
                  })
                }
                className={cn(
                  "h-7 rounded-md text-[10px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200",
                  Math.abs(transform.x - p.x) < 1 && Math.abs(transform.y - p.y) < 1
                    ? "bg-violet-500/20 text-violet-100 ring-1 ring-violet-400/35"
                    : "bg-white/5",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[10px] leading-snug text-zinc-600">
          Captions stay lower-third safe. Style is project-level (Captions panel).
        </p>
      )}

      <Button
        size="sm"
        variant="ghost"
        className="h-8 w-full text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
        onClick={() => deleteItem(item.id)}
      >
        Remove
      </Button>
    </div>
  );
}
