"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getProject } from "@/lib/api-client";
import { projectHref } from "@/lib/project-routes";

interface ProjectRedirectProps {
  projectId: string;
}

export function ProjectRedirect({ projectId }: ProjectRedirectProps) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const project = await getProject(projectId);
        if (!cancelled) router.replace(projectHref(project.status, project.id));
      } catch {
        if (!cancelled) router.replace("/projects");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, router]);

  return (
    <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
      Opening project…
    </div>
  );
}
