import { GenerationQueueView } from "@/components/generation/generation-queue-view";

interface QueuePageProps {
  params: Promise<{ id: string }>;
}

export default async function QueuePage({ params }: QueuePageProps) {
  const { id } = await params;
  return <GenerationQueueView projectId={id} />;
}
