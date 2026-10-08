"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { EditorErrorBoundary } from "./editor-error-boundary";

const VideoEditorPage = dynamic(
  () => import("./video-editor-page").then((m) => m.VideoEditorPage),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <Loader2 className="size-8 animate-spin text-[#2563EB]" />
        <p className="text-sm">Loading editor…</p>
      </div>
    ),
  },
);

export function VideoEditorClient({ projectId }: { projectId: string }) {
  return (
    <EditorErrorBoundary label="Video editor">
      <VideoEditorPage projectId={projectId} />
    </EditorErrorBoundary>
  );
}
