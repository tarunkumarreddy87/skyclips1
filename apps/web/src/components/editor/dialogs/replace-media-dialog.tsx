"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useEditorStore } from "@/lib/editor/store";
import { MediaBrowser } from "../panels/media-browser";
import { Button } from "@/components/ui/button";

export function ReplaceMediaDialog() {
  const open = useEditorStore((s) => s.ui.replaceMediaOpen);
  const selectedItemId = useEditorStore((s) => s.ui.selectedItemId);
  const setReplaceMediaOpen = useEditorStore((s) => s.setReplaceMediaOpen);
  const getSelectedItem = useEditorStore((s) => s.getSelectedItem);
  const selected = getSelectedItem();

  if (!open || !selectedItemId) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close replace media"
        className="fixed inset-0 z-[120] bg-black/60"
        onClick={() => setReplaceMediaOpen(false)}
      />
      <div className="fixed left-1/2 top-1/2 z-[130] flex max-h-[85vh] w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[#2A2A2A] bg-[#181818] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2A2A2A] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">Replace media</p>
            <p className="text-[11px] text-[#888]">{selected?.label ?? "Selected clip"}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => setReplaceMediaOpen(false)}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MediaBrowser mode="replace" itemId={selectedItemId} />
        </div>
      </div>
    </>
  );
}
