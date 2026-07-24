import { ProjectRedirect } from "@/components/project/project-redirect";

interface ProjectRedirectPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: ProjectRedirectPageProps) {
  const { id } = await params;
  return <ProjectRedirect projectId={id} />;
}
