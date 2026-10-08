"use client";
import { useState } from "react";
import { createThreePreset, threeSceneSchema } from "@hanuman/shared-types";
import { useEditorStore } from "@/lib/editor/store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function ThreeSceneTool() {
  const selected = useEditorStore(state => state.getSelectedItem());
  const tracks = useEditorStore(state => state.timeline.tracks);
  const update = useEditorStore(state => state.updateClipThreeScene);
  const [json, setJson] = useState("");
  const clip = selected?.type === "video" || selected?.type === "broll" ? selected : null;
  const locked = !!clip && tracks.some(track => track.locked && track.items.some(item => item.id === clip.id));
  const disabled = !clip || locked;
  return <div className="flex flex-col gap-2 border-b border-white/10 pb-3">
    <Label className="text-[11px] text-zinc-400">Three.js motion graphics</Label>
    <p className="text-[10px] text-zinc-500">{locked ? "Unlock this track to edit its 3D scene." : clip ? "Apply a 3D scene to this clip. Captions and sound stay on the timeline." : "Select a video or B-roll clip to apply a 3D scene."}</p>
    <div className="grid grid-cols-2 gap-1.5">{(["orbit", "bars"] as const).map(name => <Button key={name} variant="outline" size="sm" disabled={disabled} onClick={() => clip && update(clip.id, createThreePreset(name))}>{name === "orbit" ? "Orbital globe" : "3D data bars"}</Button>)}</div>
    {clip?.threeScene ? <Button size="sm" variant="ghost" disabled={locked} onClick={() => update(clip.id, null)}>Restore original footage</Button> : null}
    <details className="text-xs text-zinc-400"><summary className="cursor-pointer py-1" onClick={() => setJson(JSON.stringify(clip?.threeScene ?? createThreePreset("orbit"), null, 2))}>Scene data / AI controls</summary>
      <div className="flex flex-col gap-2 pt-2"><Textarea aria-label="Three.js scene JSON" rows={8} value={json} onChange={event => setJson(event.target.value)} />
        <Button size="sm" disabled={disabled} onClick={() => { try { const scene = threeSceneSchema.parse(JSON.parse(json)); if (clip) update(clip.id, scene); toast.success("3D scene applied"); } catch { toast.error("Invalid scene. Check objects, camera and increasing keyframe times."); } }}>Apply scene</Button>
        <p className="text-[10px]">The editor agent can change objects, colors, camera and timed movement. Scene JSON supports boxes, spheres, rings, cones, cylinders and planes.</p></div>
    </details>
  </div>;
}
