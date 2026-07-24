"use client";

import {
  GripVertical,
  Keyboard,
  MousePointer2,
  SquareDashedMousePointer,
} from "lucide-react";

export const AGENT_CLIP_MIME = "application/x-hanuman-clip-id";

/** Methods list for “Add to Agent” popover (VidRush Rush Agent parity). */
export function AgentMentionMethodsList() {
  return (
    <ul className="space-y-2 text-[11px] text-zinc-300">
      <li className="flex items-start gap-2">
        <MousePointer2 className="mt-0.5 size-3.5 shrink-0 text-zinc-500" />
        <span>
          <span className="font-medium text-zinc-100">Click</span>
          <span className="text-zinc-500"> — select a clip to insert a mention</span>
        </span>
      </li>
      <li className="flex items-start gap-2">
        <GripVertical className="mt-0.5 size-3.5 shrink-0 text-zinc-500" />
        <span>
          <span className="font-medium text-zinc-100">Drag</span>
          <span className="text-zinc-500"> — drop a clip onto Editor Agent</span>
        </span>
      </li>
      <li className="flex items-start gap-2">
        <SquareDashedMousePointer className="mt-0.5 size-3.5 shrink-0 text-zinc-500" />
        <span>
          <span className="font-medium text-zinc-100">Selection area</span>
          <span className="text-zinc-500"> — drag a box on empty track space (or Shift+drag)</span>
        </span>
      </li>
      <li className="flex items-start gap-2">
        <Keyboard className="mt-0.5 size-3.5 shrink-0 text-zinc-500" />
        <span>
          <span className="font-medium text-zinc-100">Ctrl+L</span>
          <span className="text-zinc-500"> — mention the selected clip</span>
        </span>
      </li>
    </ul>
  );
}
