"use client";

import { useEditorStore } from "@/lib/editor/store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ResetTimelineDialog() {
  const open = useEditorStore((s) => s.ui.resetConfirmOpen);
  const setResetConfirmOpen = useEditorStore((s) => s.setResetConfirmOpen);
  const resetTimeline = useEditorStore((s) => s.resetTimeline);

  return (
    <Dialog open={open} onOpenChange={setResetConfirmOpen}>
      <DialogContent className="border-white/10 bg-[#1a1a1e] text-zinc-200">
        <DialogHeader>
          <DialogTitle>Reset Timeline?</DialogTitle>
          <DialogDescription className="text-zinc-500">
            This discards all manual edits and restores the original AI-generated timeline. This cannot
            be undone except by restoring a previous History snapshot (if still retained).
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setResetConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              void resetTimeline();
            }}
          >
            Reset Timeline
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
