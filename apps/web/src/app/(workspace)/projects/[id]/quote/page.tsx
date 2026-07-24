import { ProjectQuoteView } from "@/components/project/project-quote-view";

interface QuotePageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectQuotePage({ params }: QuotePageProps) {
  const { id } = await params;
  return <ProjectQuoteView projectId={id} />;
}
