"use client";

import { ThreeSceneTool } from "./three-scene-tool";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEditorStore } from "@/lib/editor/store";

/** Object controls live inside the existing Animations tool drawer. */
export function GraphicsTool() {
  const selected = useEditorStore((state) => state.getSelectedItem());
  const assets = useEditorStore((state) => state.assets);
  const playheadMs = useEditorStore((state) => state.ui.playheadMs);
  const addGraphic = useEditorStore((state) => state.addGraphic);
  const updateGraphic = useEditorStore((state) => state.updateGraphic);
  const updateItemTransform = useEditorStore((state) => state.updateItemTransform);
  const [chartInput, setChartInput] = useState("");
  const [showChartInput, setShowChartInput] = useState(false);
  const graphic = selected?.type === "animation" ? selected.graphic : undefined;
  const selectedAsset = selected && "assetId" in selected ? assets.find((asset) => asset.id === selected.assetId) : undefined;
  const image = selectedAsset?.mediaType === "image" ? selectedAsset : assets.find((asset) => asset.mediaType === "image");

  function create(type: "frame" | "shape") {
    addGraphic({ type, start_sec: playheadMs / 1000, duration_sec: 4, width_pct: type === "frame" ? 42 : 20,
      height_pct: type === "frame" ? 58 : 20, color: "#38bdf8", shape: "rectangle", src: type === "frame" ? image?.url : undefined,
      transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, zIndex: 6 },
      keyframes: [{ time_sec: 0, x: 35, opacity: 0 }, { time_sec: 0.4, x: 40, opacity: 1 }, { time_sec: 3.6, x: 60, opacity: 1 }, { time_sec: 4, x: 65, opacity: 0 }],
    });
  }
  function addChart() {
    const data = chartInput.split(/\n/).filter((line) => line.trim()).map((line) => {
      const separator = line.lastIndexOf(":");
      return { label: line.slice(0, separator).trim(), value: Number(line.slice(separator + 1).trim()) };
    });
    if (!data.length || data.length > 12 || data.some((point) => !point.label || point.label.length > 60 || !Number.isFinite(point.value) || point.value < 0)) {
      toast.error("Enter up to 12 rows as Label: value, using nonnegative numbers."); return;
    }
    addGraphic({ type: "bar_chart", data, start_sec: playheadMs / 1000, duration_sec: 5, width_pct: 62, height_pct: 55,
      color: "#38bdf8", transform: { x: 50, y: 48, zIndex: 6 }, text: "", });
    setShowChartInput(false); setChartInput("");
  }

  return (
    <div className="flex flex-col gap-3">
      <ThreeSceneTool />
      <Label className="text-[11px] font-medium text-zinc-400">Motion objects</Label>
      <div className="grid grid-cols-3 gap-1.5">
        <Button variant="outline" size="sm" onClick={() => create("frame")}>Frame</Button>
        <Button variant="outline" size="sm" onClick={() => setShowChartInput(!showChartInput)}>Chart</Button>
        <Button variant="outline" size="sm" onClick={() => create("shape")}>Shape</Button>
      </div>
      {showChartInput ? <div className="flex flex-col gap-2">
        <Label htmlFor="graphic-chart-data" className="text-xs">Chart data</Label>
        <Textarea id="graphic-chart-data" rows={4} value={chartInput} onChange={(event) => setChartInput(event.target.value)} placeholder={"Enter one Label: value per line"} />
        <Button size="sm" onClick={addChart}>Add animated chart</Button>
      </div> : null}
      {graphic && selected?.type === "animation" ? <div className="flex flex-col gap-2">
        <Label htmlFor="graphic-title" className="text-xs">{graphic.type === "bar_chart" ? "Chart title" : "Object label"}</Label>
        <Input id="graphic-title" value={graphic.text ?? ""} onChange={(event) => updateGraphic(selected.id, { text: event.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1"><Label htmlFor="graphic-width" className="text-xs">Width %</Label><Input id="graphic-width" type="number" min={1} max={100} value={graphic.width_pct ?? 42} onChange={(event) => { const value = Number(event.target.value); if (value >= 1 && value <= 100) updateGraphic(selected.id, { width_pct: value }); }} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="graphic-height" className="text-xs">Height %</Label><Input id="graphic-height" type="number" min={1} max={100} value={graphic.height_pct ?? 54} onChange={(event) => { const value = Number(event.target.value); if (value >= 1 && value <= 100) updateGraphic(selected.id, { height_pct: value }); }} /></div>
        </div>
        <Label htmlFor="graphic-color" className="text-xs">Accent</Label>
        <Input id="graphic-color" type="color" value={graphic.color ?? "#38bdf8"} onChange={(event) => updateGraphic(selected.id, { color: event.target.value })} />
        <div className="grid grid-cols-2 gap-1.5">
          <Button variant="outline" size="sm" onClick={() => updateGraphic(selected.id, { keyframes: [] })}>Still</Button>
          <Button variant="outline" size="sm" onClick={() => { const seconds = (selected.endMs - selected.startMs) / 1000; updateGraphic(selected.id, { keyframes: [{ time_sec: 0, x: 30 }, { time_sec: seconds, x: 70 }] }); }}>Move across</Button>
        </div>
        <details className="text-xs text-zinc-400"><summary className="cursor-pointer py-1">Advanced</summary><div className="flex flex-col gap-2 pt-2">
          <Label className="text-xs">Position X / Y %</Label>
          <div className="grid grid-cols-2 gap-2">{(["x", "y"] as const).map((axis) => <Input key={axis} aria-label={`Object ${axis} position`} type="number" min={-100} max={200} value={selected.transform?.[axis] ?? 50} onChange={(event) => { const value = Number(event.target.value); if (!Number.isFinite(value) || value < -100 || value > 200) return; updateItemTransform(selected.id, { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, zIndex: 6, ...selected.transform, [axis]: value }); }} />)}</div>
          <p className="text-[10px]">The editor agent can set timed positions, scale, rotation, opacity and chart data.</p>
        </div></details>
      </div> : <p className="text-[10px] text-zinc-500">Add a frame, chart or shape. Select its timeline layer to customize it.</p>}
    </div>
  );
}
