"use client";

import { useState } from "react";
import {
  Ban,
  FlipHorizontal2,
  Settings2,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useEditorStore } from "@/lib/editor/store";
import type { AnimationPreset, ElementAnimation, TimelineItem } from "@/lib/editor/types";
import { DEFAULT_ANIMATION_DURATION_MS } from "@/lib/editor/animation-presets";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { resolveTransform } from "@/lib/editor/transform";
import { TEXT_STYLE_PRESETS, resolveTextFontFamily } from "@/lib/editor/text-fonts";

type EdgeTab = "in" | "out";

function sliderValue(v: number | readonly number[]): number {
  return typeof v === "number" ? v : (v[0] ?? 0);
}

/** VidRush Settings — Enter/Exit circular grid labels (ADR presets underneath). */
const GRID_PRESETS: { id: AnimationPreset; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "slide", label: "Slide" },
  { id: "zoom_in", label: "Scale" },
  { id: "bounce", label: "Bounce" },
  { id: "spin", label: "Flip" },
  { id: "zoom_out", label: "Zoom" },
  { id: "pop", label: "Snap" },
  { id: "wipe", label: "Glitch" },
  { id: "slide_bounce", label: "Swipe" },
  { id: "float", label: "Float" },
  { id: "drop", label: "Drop" },
  { id: "ken_burns_in", label: "Film Burn" },
  { id: "ken_burns_out", label: "Gaussian Blur" },
];

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function supportsAnimation(item: TimelineItem | null): item is TimelineItem & {
  animation?: ElementAnimation;
} {
  if (!item) return false;
  return (
    item.type === "video" ||
    item.type === "broll" ||
    item.type === "text" ||
    item.type === "captions" ||
    item.type === "animation"
  );
}

function resolvePresetForEdge(preset: AnimationPreset, edge: EdgeTab): AnimationPreset {
  if (preset === "zoom_in" && edge === "out") return "zoom_out";
  if (preset === "zoom_out" && edge === "in") return "zoom_in";
  if (preset === "ken_burns_in" && edge === "out") return "ken_burns_out";
  if (preset === "ken_burns_out" && edge === "in") return "ken_burns_in";
  return preset;
}

function isPresetSelected(selected: AnimationPreset, cardId: AnimationPreset, edge: EdgeTab): boolean {
  if (selected === cardId) return true;
  if (cardId === "zoom_in") {
    return edge === "in" ? selected === "zoom_in" : selected === "zoom_out";
  }
  if (cardId === "zoom_out") {
    return edge === "out" && selected === "zoom_out";
  }
  if (cardId === "ken_burns_in") {
    return edge === "in" ? selected === "ken_burns_in" : selected === "ken_burns_out";
  }
  if (cardId === "ken_burns_out") {
    return edge === "out" && selected === "ken_burns_out";
  }
  return false;
}

function formatSpeed(speed: number) {
  return `${speed}×`;
}

export function AnimationPanel() {
  const selectedItem = useEditorStore((s) => s.getSelectedItem());
  const updateItemAnimation = useEditorStore((s) => s.updateItemAnimation);
  const updateItemTransform = useEditorStore((s) => s.updateItemTransform);
  const updateClipMuted = useEditorStore((s) => s.updateClipMuted);
  const updateAudioVolume = useEditorStore((s) => s.updateAudioVolume);
  const addTextOverlay = useEditorStore((s) => s.addTextOverlay);
  const updateTextItem = useEditorStore((s) => s.updateTextItem);
  const selectItem = useEditorStore((s) => s.selectItem);
  const playbackSpeed = useEditorStore((s) => s.ui.playbackSpeed);
  const setPlaybackSpeed = useEditorStore((s) => s.setPlaybackSpeed);
  const toggleToolPanel = useEditorStore((s) => s.toggleToolPanel);
  const setReplaceMediaOpen = useEditorStore((s) => s.setReplaceMediaOpen);
  const [edge, setEdge] = useState<EdgeTab>("in");

  const item = supportsAnimation(selectedItem) ? selectedItem : null;
  const animation = item?.animation;
  const selectedPreset = (edge === "out" ? animation?.out?.preset : animation?.in?.preset) ?? "none";
  const durationMs =
    (edge === "out" ? animation?.out?.durationMs : animation?.in?.durationMs) ??
    DEFAULT_ANIMATION_DURATION_MS;

  const isVisualClip = item && (item.type === "video" || item.type === "broll");
  const isAudio =
    selectedItem &&
    (selectedItem.type === "narration" ||
      selectedItem.type === "music" ||
      selectedItem.type === "sfx");
  const transform = item && "transform" in item ? resolveTransform(item.transform) : null;
  const flipped = Boolean(transform && transform.scaleX < 0);
  const audioVolume =
    isAudio && selectedItem && "volume" in selectedItem ? selectedItem.volume : 80;

  function applyPreset(cardId: AnimationPreset) {
    if (!item) {
      toast.message("Select a clip first", {
        description: "Pick a scene, image, or text on the timeline.",
      });
      return;
    }
    const preset = resolvePresetForEdge(cardId, edge);
    updateItemAnimation(item.id, {
      ...animation,
      [edge]: {
        preset,
        durationMs: animation?.[edge]?.durationMs ?? DEFAULT_ANIMATION_DURATION_MS,
      },
    });
  }

  function setDuration(ms: number) {
    if (!item) return;
    const current = animation?.[edge];
    updateItemAnimation(item.id, {
      ...animation,
      [edge]: {
        preset: current?.preset ?? "fade",
        durationMs: ms,
      },
    });
  }

  function toggleFlip() {
    if (!item || !("transform" in item)) {
      toast.message("Select a visual clip to flip");
      return;
    }
    const t = resolveTransform(item.transform);
    updateItemTransform(item.id, { ...t, scaleX: -t.scaleX || (flipped ? 1 : -1) });
  }

  return (
    <div className="flex h-full flex-col bg-[#141414] text-zinc-100">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.08] px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Settings2 className="size-4 shrink-0 text-zinc-400" />
          <h2 className="truncate text-sm font-semibold tracking-tight text-white">Settings</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-lg border-white/10 bg-[#1a1a1a] px-2.5 text-[11px] text-zinc-300 hover:bg-white/[0.06]"
            disabled={!isVisualClip}
            onClick={() => setReplaceMediaOpen(true)}
            title={isVisualClip ? "Replace media" : "Select a video or image clip"}
          >
            Replace media
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close settings"
            className="text-zinc-500 hover:text-zinc-200"
            onClick={() => toggleToolPanel(false)}
          >
            <X />
          </Button>
        </div>
      </header>

      <ScrollArea className="editor-scroll min-h-0 flex-1">
        <div className="flex flex-col gap-5 px-3.5 py-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[11px] font-medium text-zinc-400">Flip</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 rounded-lg border-white/10 bg-[#1a1a1a] text-[11px]",
                  flipped && "border-primary/40 bg-primary/10 text-sky-100",
                )}
                disabled={!isVisualClip}
                onClick={toggleFlip}
              >
                <FlipHorizontal2 className="size-3.5" />
                {flipped ? "Mirrored" : "Horizontal"}
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                  <Volume2 className="size-3.5" />
                  Volume
                </Label>
                <span className="text-[10px] tabular-nums text-zinc-500">
                  {isAudio ? `${Math.round(audioVolume)}%` : isVisualClip ? (item?.muted ? "Muted" : "On") : "—"}
                </span>
              </div>
              {isAudio ? (
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[audioVolume]}
                  onValueChange={(v) => {
                    if (selectedItem) updateAudioVolume(selectedItem.id, sliderValue(v));
                  }}
                />
              ) : isVisualClip && item ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 justify-start rounded-lg border-white/10 bg-[#1a1a1a] text-[11px]"
                  onClick={() => updateClipMuted(item.id, !item.muted)}
                >
                  {item.muted ? "Unmute clip audio" : "Mute clip audio"}
                </Button>
              ) : (
                <p className="text-[10px] text-zinc-600">Select a clip to adjust volume.</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-[11px] font-medium text-zinc-400">Playback Speed</Label>
              <Select
                value={String(playbackSpeed)}
                onValueChange={(v) => {
                  if (v) setPlaybackSpeed(Number(v));
                }}
              >
                <SelectTrigger className="h-9 w-full border-white/10 bg-[#1a1a1a] text-[13px] text-zinc-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[250] border-white/10 bg-[#1c1c1c]">
                  <SelectGroup>
                    {PLAYBACK_SPEEDS.map((speed) => (
                      <SelectItem
                        key={speed}
                        value={String(speed)}
                        className="text-zinc-200 focus:bg-white/10"
                      >
                        {formatSpeed(speed)} (preview)
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="text-[9px] text-zinc-600">Synced with timeline speed — export is always 1×.</p>
            </div>
          </div>

          <Separator className="bg-white/[0.06]" />

          <div className="flex flex-col gap-3">
            <Label className="text-[11px] font-medium text-zinc-400">Animations</Label>

            <ToggleGroup
              multiple={false}
              value={[edge]}
              onValueChange={(value) => {
                const next = value[0] as EdgeTab | undefined;
                if (next === "in" || next === "out") setEdge(next);
              }}
              variant="outline"
              size="sm"
              spacing={0}
              className="rounded-lg border border-white/10 bg-[#1a1a1a] p-0.5"
            >
              <ToggleGroupItem
                value="in"
                className="min-w-[72px] rounded-md border-0 text-[12px] data-[pressed]:bg-[#2a2a2a] data-[pressed]:text-white"
              >
                Enter
              </ToggleGroupItem>
              <ToggleGroupItem
                value="out"
                className="min-w-[72px] rounded-md border-0 text-[12px] data-[pressed]:bg-[#2a2a2a] data-[pressed]:text-white"
              >
                Exit
              </ToggleGroupItem>
            </ToggleGroup>

            {!item ? (
              <p className="text-[11px] leading-relaxed text-zinc-500">
                Select a clip on the timeline to apply Enter / Exit motion.
              </p>
            ) : null}

            <div className="grid grid-cols-4 gap-x-2 gap-y-3.5 pt-1">
              {GRID_PRESETS.map((p) => {
                const selected = isPresetSelected(selectedPreset, p.id, edge);
                return (
                  <button
                    key={`${edge}-${p.id}`}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className="group flex flex-col items-center gap-1.5"
                    title={p.label}
                  >
                    <span
                      className={cn(
                        "flex size-[52px] items-center justify-center rounded-full border bg-[#1a1a1a] transition",
                        selected
                          ? "border-[#3B82F6] shadow-[0_0_0_2px_rgba(59,130,246,0.35),0_0_14px_rgba(37,99,235,0.35)]"
                          : "border-white/10 group-hover:scale-[1.03] group-hover:border-white/25",
                      )}
                    >
                      <InOutIcon id={p.id} />
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-medium leading-tight",
                        selected ? "text-white" : "text-zinc-500 group-hover:text-zinc-300",
                      )}
                    >
                      {p.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {item && selectedPreset !== "none" ? (
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#1a1a1a] px-3 py-2.5">
                <Zap className="size-3.5 shrink-0 text-primary" />
                <span className="text-[11px] text-zinc-400">Duration</span>
                <Slider
                  className="mx-1 flex-1"
                  min={100}
                  max={3000}
                  step={50}
                  value={[durationMs]}
                  onValueChange={(v) => setDuration(sliderValue(v))}
                />
                <span className="w-10 text-right text-[11px] tabular-nums text-zinc-300">
                  {(durationMs / 1000).toFixed(1)}s
                </span>
              </div>
            ) : null}
          </div>

          <Separator className="bg-white/[0.06]" />

          <div className="flex flex-col gap-2">
            <Label className="text-[11px] font-medium text-zinc-400">Text styles</Label>
            <p className="text-[10px] leading-snug text-zinc-500">
              Add styled title text on the canvas — drag to move, corners to scale.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {TEXT_STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="flex flex-col items-start gap-0.5 rounded-lg border border-white/10 bg-[#1a1a1a] px-2 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/10"
                  onClick={() => {
                    // The store returns the new ID synchronously. Never rely on
                    // global selection in rAF: a fast second click can select a
                    // newer overlay and style the wrong one.
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
                    selectItem(id);
                    toast.success(`Added ${preset.label}`);
                  }}
                >
                  <span
                    className="w-full truncate text-[11px] font-bold tracking-wide text-zinc-100"
                    style={{
                      fontFamily: resolveTextFontFamily(preset.fontFamily),
                      color: preset.color,
                    }}
                  >
                    {preset.preview}
                  </span>
                  <span className="text-[9px] text-zinc-500">
                    {preset.label}
                    {preset.motionIn ? " · motion" : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function InOutIcon({ id }: { id: AnimationPreset }) {
  if (id === "none") return <Ban className="size-5 text-zinc-400" />;
  return (
    <svg viewBox="0 0 40 40" className="size-7 text-zinc-300" aria-hidden>
      {id === "fade" && (
        <>
          <defs>
            <linearGradient id="vrFade2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          <rect x="8" y="8" width="24" height="24" rx="3" fill="url(#vrFade2)" />
        </>
      )}
      {id === "float" && (
        <>
          <rect x="14" y="10" width="12" height="12" rx="2" fill="currentColor" opacity="0.25" />
          <rect x="11" y="14" width="12" height="12" rx="2" fill="currentColor" opacity="0.45" />
          <rect x="8" y="18" width="14" height="14" rx="2" fill="currentColor" />
        </>
      )}
      {(id === "zoom_in" || id === "ken_burns_in") && (
        <>
          <rect x="12" y="12" width="16" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <rect x="8" y="8" width="24" height="24" rx="2" fill="currentColor" opacity="0.35" />
        </>
      )}
      {(id === "zoom_out" || id === "ken_burns_out") && (
        <>
          <rect x="8" y="8" width="24" height="24" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <rect x="14" y="14" width="12" height="12" rx="2" fill="currentColor" opacity="0.55" />
        </>
      )}
      {id === "slide" && (
        <>
          <rect x="6" y="14" width="14" height="12" rx="2" fill="currentColor" opacity="0.35" />
          <rect x="16" y="14" width="14" height="12" rx="2" fill="currentColor" />
          <path d="M12 20h10" stroke="currentColor" strokeWidth="1.5" opacity="0.8" />
        </>
      )}
      {id === "bounce" && (
        <>
          <circle cx="20" cy="14" r="6" fill="currentColor" opacity="0.35" />
          <circle cx="20" cy="24" r="7" fill="currentColor" />
        </>
      )}
      {id === "spin" && (
        <path
          d="M12 20a8 8 0 1 1 2.3 5.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
      {id === "pop" && (
        <>
          <rect x="12" y="12" width="16" height="16" rx="3" fill="currentColor" opacity="0.9" />
          <path d="M8 12l4-4M32 12l-4-4M8 28l4 4M32 28l-4 4" stroke="currentColor" strokeWidth="1.5" />
        </>
      )}
      {id === "drop" && (
        <>
          <rect x="12" y="6" width="16" height="10" rx="2" fill="currentColor" opacity="0.3" />
          <rect x="12" y="20" width="16" height="14" rx="2" fill="currentColor" />
        </>
      )}
      {id === "wipe" && (
        <>
          <rect x="8" y="10" width="24" height="20" rx="2" fill="currentColor" opacity="0.25" />
          <path d="M14 10v20M20 8v24M26 10v20" stroke="currentColor" strokeWidth="1.5" />
        </>
      )}
      {id === "slide_bounce" && (
        <>
          <rect x="8" y="14" width="12" height="12" rx="2" fill="currentColor" opacity="0.4" />
          <rect x="20" y="14" width="12" height="12" rx="2" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
