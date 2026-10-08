"use client";

import { Blend, X, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useEditorStore } from "@/lib/editor/store";
import type { TransitionType } from "@/lib/editor/types";
import {
  DEFAULT_TRANSITION_DURATION_MS,
  TRANSITION_PRESETS,
} from "@/lib/editor/transition-presets";
import { dualClipTransitionStyles, transitionOverlayStyle } from "@/lib/editor/preview-transition";
import { transitionSound } from "@/lib/editor/transition-sounds";
import { Switch } from "@/components/ui/switch";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TransitionsPanel() {
  const selectedTransitionId = useEditorStore((s) => s.ui.selectedTransitionId);
  const transitions = useEditorStore((s) => s.timeline.transitions);
  const tracks = useEditorStore((s) => s.timeline.tracks);
  const setTransition = useEditorStore((s) => s.setTransition);
  const setTransitionSound = useEditorStore((s) => s.setTransitionSound);
  const deleteTransition = useEditorStore((s) => s.deleteTransition);
  const addTransition = useEditorStore((s) => s.addTransition);
  const toggleToolPanel = useEditorStore((s) => s.toggleToolPanel);
  const selectTransition = useEditorStore((s) => s.selectTransition);

  const transition = transitions.find((t) => t.id === selectedTransitionId) ?? null;

  const canAddBoundary = useMemo(() => {
    const videoTrack = tracks.find((t) => t.type === "video");
    return Boolean(videoTrack && videoTrack.items.length >= 2);
  }, [tracks]);

  const afterLabel = useMemo(() => {
    if (!transition) return null;
    for (const track of tracks) {
      const item = track.items.find((i) => i.id === transition.afterItemId);
      if (item) return item.label;
    }
    return transition.afterItemId;
  }, [transition, tracks]);

  const nextLabel = useMemo(() => {
    if (!transition) return null;
    const videoTrack = tracks.find((t) => t.type === "video");
    if (!videoTrack) return null;
    const sorted = [...videoTrack.items].sort((a, b) => a.startMs - b.startMs);
    const idx = sorted.findIndex((i) => i.id === transition.afterItemId);
    return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1].label : null;
  }, [transition, tracks]);

  function ensureOnBoundary(type: TransitionType = "fade", afterItemId?: string): string | null {
    const videoTrack = tracks.find((t) => t.type === "video");
    if (!videoTrack || videoTrack.items.length < 2) return null;
    const sorted = [...videoTrack.items].sort((a, b) => a.startMs - b.startMs);
    let afterId = afterItemId;
    if (!afterId) {
      const selected = useEditorStore.getState().getSelectedItem();
      if (selected?.type === "video") {
        const idx = sorted.findIndex((i) => i.id === selected.id);
        if (idx >= 0 && idx < sorted.length - 1) afterId = selected.id;
      }
    }
    if (!afterId) afterId = sorted[0].id;
    if (type === "cut") {
      const existing = transitions.find((t) => t.afterItemId === afterId && t.enabled);
      if (existing) {
        deleteTransition(existing.id);
        selectTransition(null);
      }
      return null;
    }
    const id = addTransition(afterId, type, DEFAULT_TRANSITION_DURATION_MS);
    if (id) selectTransition(id);
    return id;
  }

  function pickType(type: TransitionType) {
    if (!transition) {
      ensureOnBoundary(type);
      return;
    }
    if (type === "cut") {
      deleteTransition(transition.id);
      return;
    }
    setTransition(transition.id, type, transition.durationMs || DEFAULT_TRANSITION_DURATION_MS);
  }

  return (
    <div className="flex h-full flex-col bg-[#141414] text-zinc-100">
      <header className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Blend className="size-4 shrink-0 text-zinc-400" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-white">Transitions</h2>
            {afterLabel ? (
              <p className="truncate text-[10px] text-zinc-500">
                After “{afterLabel}”
                {nextLabel ? ` → “${nextLabel}”` : ""}
              </p>
            ) : (
              <p className="text-[10px] text-zinc-500">{TRANSITION_PRESETS.length} presets</p>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close"
          className="text-zinc-500 hover:text-zinc-200"
          onClick={() => toggleToolPanel(false)}
        >
          <X />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3.5">
        {transition ? (
          <DurationRow
            valueMs={transition.durationMs || DEFAULT_TRANSITION_DURATION_MS}
            disabled={transition.transitionType === "cut"}
            onChange={(ms) => setTransition(transition.id, transition.transitionType, ms)}
          />
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-[#1a1a1a] px-3 py-2.5">
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Click a transition marker between clips, or add one on the first cut.
            </p>
            {canAddBoundary ? (
              <Button type="button" size="sm" className="w-fit" onClick={() => ensureOnBoundary("fade")}>
                Add fade on first cut
              </Button>
            ) : (
              <p className="text-[10px] text-amber-400/90">Need at least two video clips.</p>
            )}
          </div>
        )}

        {transition && transitionSound(transition.transitionType) && (
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="transition-sound">Transition sound</FieldLabel>
                <FieldDescription>{transitionSound(transition.transitionType)?.label} · synced to this cut</FieldDescription>
              </FieldContent>
              <Switch id="transition-sound" checked={!transition.sfxMuted}
                onCheckedChange={checked => setTransitionSound(transition.id, checked)} />
            </Field>
          </FieldGroup>
        )}
        <p className="text-xs text-muted-foreground">Hover or focus to preview. Choose a style to apply it.</p>
        <div className="grid grid-cols-2 gap-2">
          {TRANSITION_PRESETS.map(p => <TransitionTile key={p.id} preset={p}
            selected={transition?.transitionType === p.id} onPick={() => pickType(p.id)} />)}
        </div>

        {transition ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => deleteTransition(transition.id)}
          >
            Remove transition
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function DurationRow({
  valueMs,
  onChange,
  disabled,
}: {
  valueMs: number;
  onChange: (ms: number) => void;
  disabled?: boolean;
}) {
  const sec = valueMs / 1000;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2",
        disabled && "opacity-50",
      )}
    >
      <Zap className="size-3.5 shrink-0 text-amber-500" />
      <span className="text-xs font-medium text-zinc-400">Duration</span>
      <input
        type="range"
        min={100}
        max={2000}
        step={50}
        disabled={disabled}
        value={valueMs}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mx-1 h-1.5 flex-1 cursor-pointer accent-emerald-500"
      />
      <span className="w-12 text-center text-xs font-medium text-zinc-200">{sec.toFixed(1)}s</span>
    </div>
  );
}

function TransitionTile({ preset, selected, onPick }: {
  preset: (typeof TRANSITION_PRESETS)[number]; selected: boolean; onPick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [progress, setProgress] = useState(0.5);
  useEffect(() => {
    if (!hovered || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setProgress(Math.min(1, Math.max(0, ((now - start) % 1800 - 300) / 750)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [hovered]);
  const style = dualClipTransitionStyles(preset.id, progress);
  return <button type="button" title={preset.blurb} aria-pressed={selected}
    onClick={onPick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setHovered(true)} onBlur={() => setHovered(false)}
    className={cn("flex min-w-0 flex-col gap-2 rounded-xl border p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
      selected ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent")}>
    <span aria-hidden className="relative isolate block aspect-video w-full overflow-hidden rounded-lg bg-black">
      <span className="absolute inset-0 flex items-center justify-center text-xl font-semibold"
        style={{ background: "linear-gradient(135deg, #30596a, #a2c5ba)", color: "#f4f5de", ...style.from }}>01</span>
      <span className="absolute inset-0 flex items-center justify-center text-xl font-semibold"
        style={{ background: "linear-gradient(135deg, #322d53, #e0a87b)", color: "#fff0e5", ...style.to }}>02</span>
      <span className="absolute inset-0 z-10" style={transitionOverlayStyle(preset.id, progress)} />
    </span>
    <span className="text-xs font-medium text-foreground">{preset.label}</span>
    <span className="text-[10px] text-muted-foreground">{transitionSound(preset.id) ? "Sound included" : "Silent blend"}</span>
  </button>;
}
