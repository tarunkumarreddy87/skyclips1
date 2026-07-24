"use client";

import { Blend, X, Zap } from "lucide-react";
import { useMemo } from "react";
import { useEditorStore } from "@/lib/editor/store";
import type { TransitionType } from "@/lib/editor/types";
import {
  DEFAULT_TRANSITION_DURATION_MS,
  TRANSITION_PRESETS,
} from "@/lib/editor/transition-presets";
import { transitionPreviewNote } from "@/lib/editor/export-honesty";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TransitionsPanel() {
  const selectedTransitionId = useEditorStore((s) => s.ui.selectedTransitionId);
  const transitions = useEditorStore((s) => s.timeline.transitions);
  const tracks = useEditorStore((s) => s.timeline.tracks);
  const setTransition = useEditorStore((s) => s.setTransition);
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

        <div className="grid grid-cols-3 gap-2">
            {TRANSITION_PRESETS.map((p) => {
              const selected = transition?.transitionType === p.id;
              const approx = transitionPreviewNote(p.id) === "approx";
              return (
                <button
                  key={p.id}
                  type="button"
                  title={
                    approx
                      ? `${p.blurb} — CSS preview is softer; Remotion export is authoritative`
                      : p.blurb
                  }
                  onClick={() => pickType(p.id)}
                  className={cn(
                    "relative flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition-colors",
                    selected
                      ? "border-primary/50 bg-primary/10"
                      : "border-white/10 bg-[#1a1a1a] hover:border-white/20",
                  )}
                >
                  {approx ? (
                    <span className="absolute right-1 top-1 rounded bg-amber-500/20 px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-amber-200/90">
                      ~
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "relative flex size-12 items-center justify-center overflow-hidden rounded-full border",
                      selected ? "border-primary bg-[#1a1a1a]" : "border-white/10 bg-[#1a1a1a]",
                    )}
                  >
                    <TransitionThumb type={p.id} />
                  </span>
                  <span className="text-[10px] font-medium leading-tight text-zinc-300">
                    {p.label}
                  </span>
                </button>
              );
            })}
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

/** Tiny CSS “thumbnail” suggesting the wipe/fade direction. */
function TransitionThumb({ type }: { type: TransitionType }) {
  if (type === "cut") {
    return (
      <span className="flex h-full w-full">
        <span className="w-1/2 bg-zinc-400" />
        <span className="w-1/2 bg-zinc-700" />
      </span>
    );
  }
  if (type === "fade" || type === "dissolve") {
    return (
      <span
        className="h-full w-full"
        style={{
          background: "linear-gradient(90deg, #71717a 0%, #a1a1aa 50%, #3f3f46 100%)",
        }}
      />
    );
  }
  if (type.startsWith("wipe") || type.startsWith("slide")) {
    const dir =
      type.includes("left") || type === "slide"
        ? "90deg"
        : type.includes("right") || type === "slide-pan"
          ? "270deg"
          : type.includes("up")
            ? "0deg"
            : "180deg";
    return (
      <span
        className="h-full w-full"
        style={{
          background: `linear-gradient(${dir}, #52525b 40%, #d4d4d8 50%, #27272a 60%)`,
        }}
      />
    );
  }
  if (type === "zoom" || type === "circleopen" || type === "circleclose") {
    return (
      <span className="relative flex size-full items-center justify-center bg-zinc-700">
        <span
          className={cn(
            "rounded-full border-2 border-zinc-300",
            type === "circleclose" ? "size-4" : "size-7",
          )}
        />
      </span>
    );
  }
  if (type === "pixelize") {
    return (
      <span className="grid h-full w-full grid-cols-4 grid-rows-3 gap-px bg-zinc-300">
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} className={i % 2 === 0 ? "bg-zinc-500" : "bg-zinc-800"} />
        ))}
      </span>
    );
  }
  if (type === "film-burn") {
    return (
      <span
        className="h-full w-full"
        style={{
          background: "radial-gradient(circle at 50% 50%, #fbbf24, #7f1d1d 70%)",
        }}
      />
    );
  }
  if (type === "glitch") {
    return (
      <span className="flex h-full w-full flex-col gap-0.5 overflow-hidden bg-black p-0.5">
        <span className="h-1.5 w-full bg-cyan-400/80" />
        <span className="h-1.5 w-[80%] self-end bg-fuchsia-500/80" />
        <span className="h-1.5 w-full bg-zinc-200/70" />
      </span>
    );
  }
  return <span className="h-full w-full bg-zinc-400" />;
}
