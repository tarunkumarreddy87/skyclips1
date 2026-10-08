"use client";

import type { TransitionItem } from "@/lib/editor/types";
import { useEditorStore } from "@/lib/editor/store";
import { TRANSITION_PRESETS } from "@/lib/editor/transition-presets";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sliderValue } from "@/lib/editor/slider-utils";
import { Slider } from "@/components/ui/slider";

export function TransitionPropertiesCard({ transition }: { transition: TransitionItem }) {
  const setTransition = useEditorStore((s) => s.setTransition);
  const deleteTransition = useEditorStore((s) => s.deleteTransition);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const toggleToolPanel = useEditorStore((s) => s.toggleToolPanel);

  return (
    <div className="space-y-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-blue-400">Transition</p>
        <button
          type="button"
          className="text-[10px] font-medium text-emerald-400 hover:underline"
          onClick={() => {
            setActiveTool("transitions");
            toggleToolPanel(true);
          }}
        >
          Open panel
        </button>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[10px] text-zinc-500">Type</Label>
        <Select
          value={transition.transitionType}
          onValueChange={(v) => v && setTransition(transition.id, v as TransitionItem["transitionType"])}
        >
          <SelectTrigger className="h-8 border-white/10 bg-white/5 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSITION_PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] text-zinc-500">Duration ({transition.durationMs}ms)</Label>
        <Slider
          value={[transition.durationMs]}
          min={0}
          max={1500}
          step={50}
          onValueChange={(v) => setTransition(transition.id, transition.transitionType, sliderValue(v))}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full border-white/10 text-xs text-red-400"
        onClick={() => deleteTransition(transition.id)}
      >
        Remove (hard cut)
      </Button>
      <p className="text-[9px] leading-snug text-zinc-600">
        Transitions use the same timing in preview and export.
      </p>
    </div>
  );
}
