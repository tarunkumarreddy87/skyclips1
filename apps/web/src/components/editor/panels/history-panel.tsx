"use client";

import { RotateCcw } from "lucide-react";
import { useEditorStore } from "@/lib/editor/store";
import { formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function HistoryPanel() {
  const history = useEditorStore((s) => s.history);
  const saveStatus = useEditorStore((s) => s.ui.saveStatus);
  const setRestoreDialogId = useEditorStore((s) => s.setRestoreDialogId);

  return (
    <div className="space-y-1 p-3">
      <p className="mb-1 text-xs text-zinc-500">
        Restore points (original + last 40). Identical consecutive edits are not re-uploaded.
      </p>
      <p className="mb-3 text-[10px] leading-relaxed text-zinc-600">
        <span className="font-medium text-zinc-400">Render video</span> exports the{" "}
        <span className="text-zinc-400">live editor</span> via native engine (after flush) — not whichever
        history row is highlighted. Status:{" "}
        <span className={saveStatus === "saved" ? "text-emerald-500/90" : "text-amber-500/90"}>
          {saveStatus === "saved" ? "Render-ready" : saveStatus === "unsaved" ? "Unsaved edits" : saveStatus}
        </span>
        .
      </p>
      {history.length === 0 && (
        <p className="text-[10px] text-zinc-600">
          No snapshots yet — edits autosave within a few seconds when content changes.
        </p>
      )}
      {history.map((snap) => (
        <div
          key={snap.id}
          className="flex items-center justify-between rounded-lg border border-white/10 p-2 hover:bg-white/5"
        >
          <div>
            <p className="text-xs text-zinc-300">
              {snap.label}
              {snap.isOriginal && (
                <span className="ml-1.5 rounded bg-blue-600/20 px-1 text-[9px] text-blue-400">
                  pinned
                </span>
              )}
            </p>
            <p className="text-[10px] text-zinc-600">{formatRelativeTime(snap.createdAt)}</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-zinc-500 hover:text-white"
            title="Restore this snapshot into the editor (then Render uses the restored live state)"
            onClick={() => setRestoreDialogId(snap.id)}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
