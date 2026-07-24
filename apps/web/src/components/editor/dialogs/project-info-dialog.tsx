"use client";

import { useEditorStore } from "@/lib/editor/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ProjectInfoDialog() {
  const open = useEditorStore((s) => s.ui.infoOpen);
  const setInfoOpen = useEditorStore((s) => s.setInfoOpen);
  const project = useEditorStore((s) => s.project);

  return (
    <Dialog open={open} onOpenChange={setInfoOpen}>
      <DialogContent className="border-white/10 bg-[#1a1a1e] text-zinc-200">
        <DialogHeader>
          <DialogTitle>Project info</DialogTitle>
        </DialogHeader>
        <dl className="space-y-2 text-sm">
          {[
            ["Prompt", project.prompt],
            ["Model", project.model],
            ["Language", project.language],
            ["Voice", project.voice],
            ["Brand", project.brandProfile],
            ["Format", project.format],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-zinc-500">{k}</dt>
              <dd className="text-zinc-300">{v}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
