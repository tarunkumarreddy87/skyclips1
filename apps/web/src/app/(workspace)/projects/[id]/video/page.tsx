import { VideoResultView } from "@/components/video/video-result-view";

interface VideoPageProps {
  params: Promise<{ id: string }>;
}

export default async function VideoPage({ params }: VideoPageProps) {
  const { id } = await params;
  return <VideoResultView projectId={id} />;
}

