"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Play } from "lucide-react";
import type { Project } from "@hanuman/shared-types";
import { listProjects } from "@/lib/api-client";
import { mockProjects } from "@/lib/mock-data";
import { projectHref, useMockProjectsList } from "@/lib/project-routes";
import { projectThumbnailUrl } from "@/lib/project-thumbnail";
import { formatRelativeTime } from "@/lib/utils";
import { StatusBadge } from "@/components/projects/status-badge";

type ListItem = Project & { prompt?: string };

export function RecentProjects() {
  const [projects, setProjects] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const useMock = useMockProjectsList();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (useMock) {
        setProjects(
          mockProjects.slice(0, 4).map((p) => ({
            id: p.id,
            userId: "mock",
            title: p.title,
            status:
              p.status === "processing"
                ? "running"
                : p.status === "editing"
                  ? "quoted"
                  : p.status,
            entryPath: "prompt_first",
            formatMode: p.format,
            createdAt: p.createdAt,
            updatedAt: p.createdAt,
            prompt: p.prompt,
          })),
        );
        setLoading(false);
        return;
      }
      try {
        const result = await listProjects();
        if (!cancelled) {
          setProjects(
            [...result.items]
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .slice(0, 4),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useMock]);

  if (loading) {
    return (
      <section className="mx-auto flex w-full max-w-5xl items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading recent projects…
      </section>
    );
  }

  if (projects.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium tracking-tight text-muted-foreground">
          Recent projects
        </h2>
        <Link
          href="/projects"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          View all
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {projects.map((project) => {
          const thumbnail = projectThumbnailUrl(project.id, project.formatMode);

          return (
            <Link
              key={project.id}
              href={projectHref(project.status, project.id)}
              className="group block"
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted ring-1 ring-border/60 transition-colors group-hover:ring-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnail}
                  alt=""
                  className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <span className="absolute left-2.5 top-2.5 inline-flex size-7 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm ring-1 ring-white/15">
                  <Play className="size-3 fill-current" />
                </span>
                <div className="absolute right-2.5 top-2.5">
                  <StatusBadge status={project.status} />
                </div>
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="truncate text-sm font-medium text-white">{project.title}</p>
                  <p className="mt-0.5 text-xs text-white/55">{formatRelativeTime(project.createdAt)}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
