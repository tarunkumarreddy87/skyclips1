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

export function RestoreConfirmDialog() {
  const restoreId = useEditorStore((s) => s.ui.restoreDialogId);
  const history = useEditorStore((s) => s.history);
  const setRestoreDialogId = useEditorStore((s) => s.setRestoreDialogId);
  const restoreSnapshot = useEditorStore((s) => s.restoreSnapshot);

  const snap = history.find((h) => h.id === restoreId);

  return (
    <Dialog open={!!restoreId} onOpenChange={(o) => !o && setRestoreDialogId(null)}>
      <DialogContent className="border-white/10 bg-[#1a1a1e] text-zinc-200">
        <DialogHeader>
          <DialogTitle>Restore snapshot?</DialogTitle>
          <DialogDescription className="text-zinc-500">
            This will revert the timeline to &ldquo;{snap?.label}&rdquo;. Your current edits remain in
            history as the previous autosave.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setRestoreDialogId(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (restoreId) void restoreSnapshot(restoreId);
            }}
          >
            Restore
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
