import { VideoEditorClient } from "@/components/editor/video-editor-client";

interface EditorPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditorPage({ params }: EditorPageProps) {
  const { id } = await params;
  return <VideoEditorClient projectId={id} />;
}
