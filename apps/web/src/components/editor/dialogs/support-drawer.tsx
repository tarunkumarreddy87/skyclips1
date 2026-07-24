"use client";

import { useEditorStore } from "@/lib/editor/store";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function SupportDrawer() {
  const open = useEditorStore((s) => s.ui.supportOpen);
  const setSupportOpen = useEditorStore((s) => s.setSupportOpen);

  return (
    <Sheet open={open} onOpenChange={setSupportOpen}>
      <SheetContent className="border-white/10 bg-[#1a1a1e] text-zinc-200">
        <SheetHeader>
          <SheetTitle>Editor support</SheetTitle>
        </SheetHeader>
        <p className="text-sm text-zinc-500">Describe your issue with the editor or generation pipeline.</p>
        <Textarea placeholder="What went wrong?" rows={5} className="mt-4 border-white/10 bg-white/5" />
        <Button className="mt-3 w-full" disabled title="Support inbox coming soon">
          Send message
        </Button>
        <p className="mt-2 text-center text-[10px] text-zinc-600">
          Support delivery isn’t wired yet — copy your note and email the team.
        </p>
      </SheetContent>
    </Sheet>
  );
}
