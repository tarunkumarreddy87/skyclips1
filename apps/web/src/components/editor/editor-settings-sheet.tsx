"use client";

import { Settings2, X } from "lucide-react";
import { useEditorStore } from "@/lib/editor/store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CanvasSettingsCard } from "./right-panel/canvas-settings-card";
import { ClipPropertiesCard } from "./right-panel/clip-properties-card";
import { TextPropertiesCard } from "./right-panel/text-properties-card";
import { AudioSettingsCard } from "./right-panel/audio-settings-card";
import { TransitionPropertiesCard } from "./right-panel/transition-properties-card";
import { IconButton } from "./shell/icon-button";
import { cn } from "@/lib/utils";

/** Docked inspector — no modal focus trap, so timeline drag stays real-time. */
export function EditorInspectorPanel() {
  const open = useEditorStore((s) => s.ui.rightPanelOpen);
  const setRightPanelOpen = useEditorStore((s) => s.setRightPanelOpen);
  const selectedItem = useEditorStore((s) => s.getSelectedItem());
  const selectedTransitionId = useEditorStore((s) => s.ui.selectedTransitionId);
  const transitions = useEditorStore((s) => s.timeline.transitions);
  const transition = transitions.find((t) => t.id === selectedTransitionId);

  const isClip = selectedItem && (selectedItem.type === "video" || selectedItem.type === "broll");
  const isText = selectedItem && (selectedItem.type === "text" || selectedItem.type === "captions");
  const isAudio =
    selectedItem &&
    (selectedItem.type === "narration" || selectedItem.type === "music" || selectedItem.type === "sfx");

  const sheetTitle = transition
    ? "Transition"
    : isClip
      ? "Clip"
      : isText
        ? "Text"
        : isAudio
          ? "Audio"
          : "Inspector";

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden border-l border-white/[0.1] bg-[#121214] transition-[width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        open
          ? "w-[300px] rounded-tl-2xl opacity-100 shadow-[-8px_0_28px_rgba(0,0,0,0.28)]"
          : "pointer-events-none w-0 border-l-0 opacity-0",
      )}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 px-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-zinc-200">
          <Settings2 className="size-4 shrink-0 text-zinc-500" />
          <span className="truncate">{sheetTitle}</span>
        </div>
        <IconButton
          size="sm"
          className="size-7 shrink-0 rounded-md hover:bg-white/[0.08]"
          title="Close inspector"
          onClick={() => setRightPanelOpen(false)}
        >
          <X className="size-3.5" />
        </IconButton>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {transition && <TransitionPropertiesCard transition={transition} />}
          {isClip && <ClipPropertiesCard item={selectedItem} />}
          {isText && <TextPropertiesCard item={selectedItem} />}
          {isAudio && <AudioSettingsCard item={selectedItem} />}
          {!transition && !isClip && !isText && !isAudio ? (
            <p className="px-1 text-[11px] leading-relaxed text-zinc-500">
              Select a clip, then open Inspector from the canvas toolbar — or double-click a timeline
              clip. Moving clips will not open this panel.
            </p>
          ) : null}
          <CanvasSettingsCard />
        </div>
      </ScrollArea>
    </aside>
  );
}

/** @deprecated Use EditorInspectorPanel — kept name for existing imports. */
export function EditorSettingsSheet() {
  return <EditorInspectorPanel />;
}
