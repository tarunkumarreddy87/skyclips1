import { PublishScheduleView } from "@/components/publish/publish-schedule-view";

export default async function PublishPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PublishScheduleView projectId={id} />;
}
