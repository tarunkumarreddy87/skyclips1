"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useEditorStore } from "@/lib/editor/store";
import { EDITOR_TOOLS } from "@/lib/editor/tools";
import { MediaBrowser } from "./panels/media-browser";
import { TextToolPanel } from "./panels/text-tool-panel";
import { AudioToolPanel } from "./panels/audio-tool-panel";
import { AnimationPanel } from "./panels/animation-panel";
import { TransitionsPanel } from "./panels/transitions-panel";
import { TemplatesPanel } from "./panels/templates-panel";
import { FilesPanel } from "./panels/files-panel";
import { HistoryPanel } from "./panels/history-panel";
import { EffectsPanel } from "./panels/effects-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DRAWER_WIDTH = 320;

export function EditorToolDrawer() {
  const open = useEditorStore((s) => s.ui.toolPanelOpen);
  const activeTool = useEditorStore((s) => s.ui.activeTool);
  const toggleToolPanel = useEditorStore((s) => s.toggleToolPanel);
  const contentRef = useRef<HTMLDivElement>(null);
  const label = activeTool === "text"
    ? "Appearance"
    : EDITOR_TOOLS.find((t) => t.id === activeTool)?.label ?? "Tools";

  useEffect(() => {
    if (open) contentRef.current?.scrollTo({ top: 0 });
  }, [activeTool, open]);

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close tools panel"
          className="absolute inset-0 z-30 bg-black/45 backdrop-blur-[1px] transition-opacity duration-280 md:hidden"
          onClick={() => toggleToolPanel(false)}
        />
      )}
      <aside
        className={cn(
          "editor-tool-drawer-enter absolute left-0 top-0 z-40 flex h-full flex-col overflow-hidden",
          "rounded-r-2xl border-r border-white/[0.1] bg-[#141414] shadow-[12px_0_40px_rgba(0,0,0,0.5)]",
          open ? "translate-x-0" : "-translate-x-full pointer-events-none",
        )}
        style={{ width: DRAWER_WIDTH }}
        aria-hidden={!open}
      >
        <div className="flex h-full w-full flex-col">
          {activeTool === "animations" ? (
            <div className="editor-scroll min-h-0 flex-1 overflow-hidden">
              <AnimationPanel />
            </div>
          ) : activeTool === "transitions" ? (
            <div className="editor-scroll min-h-0 flex-1 overflow-hidden">
              <TransitionsPanel />
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-3 py-2.5">
                <p className="text-xs font-medium text-[#D4D4D4]">{label}</p>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 rounded-lg text-[#888]"
                  onClick={() => toggleToolPanel(false)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              <div ref={contentRef} className="editor-scroll min-h-0 flex-1 overflow-y-auto">
                {activeTool === "media" && <MediaBrowser />}
                {activeTool === "text" && <TextToolPanel />}
                {activeTool === "audio" && <AudioToolPanel />}
                {activeTool === "templates" && <TemplatesPanel />}
                {activeTool === "files" && <FilesPanel />}
                {activeTool === "history" && <HistoryPanel />}
                {activeTool === "effects" && <EffectsPanel />}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
