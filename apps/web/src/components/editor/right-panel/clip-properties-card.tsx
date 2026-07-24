"use client";

import type { ClipItem } from "@/lib/editor/types";
import { useEditorStore } from "@/lib/editor/store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function ClipPropertiesCard({ item }: { item: ClipItem }) {
  const updateClipFitMode = useEditorStore((s) => s.updateClipFitMode);
  const updateClipMuted = useEditorStore((s) => s.updateClipMuted);
  const setReplaceMediaOpen = useEditorStore((s) => s.setReplaceMediaOpen);

  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-3">
      <p className="text-xs font-medium text-zinc-400">Clip</p>
      <p className="text-[10px] text-zinc-600">{item.label}</p>

      <Button
        size="sm"
        variant="outline"
        className="w-full border-white/10 text-xs"
        onClick={() => setReplaceMediaOpen(true)}
      >
        Replace media
      </Button>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-zinc-500">Fit mode</Label>
        <Select
          value={item.fitMode === "fill" ? "cover" : item.fitMode}
          onValueChange={(v) => v && updateClipFitMode(item.id, v as ClipItem["fitMode"])}
        >
          <SelectTrigger className="h-8 border-white/10 bg-white/5 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cover">Cover</SelectItem>
            <SelectItem value="contain">Contain</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-[10px] text-zinc-500">Mute clip audio</Label>
        <Switch checked={item.muted} onCheckedChange={(c) => updateClipMuted(item.id, c)} />
      </div>
    </div>
  );
}
