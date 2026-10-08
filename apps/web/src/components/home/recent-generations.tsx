"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, Video } from "lucide-react";
import type { Project } from "@hanuman/shared-types";
import { listProjects } from "@/lib/api-client";
import { mockProjects } from "@/lib/mock-data";
import { projectHref, useMockProjectsList } from "@/lib/project-routes";
import { projectThumbnailUrl } from "@/lib/project-thumbnail";
import { formatRelativeTime } from "@/lib/utils";

type ListItem = Project & { prompt?: string };



export function RecentGenerations() {
  const [projects, setProjects] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const useMock = useMockProjectsList();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (useMock) {
        setProjects(
          mockProjects.slice(0, 5).map((p) => ({
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
              .sort(
                (a, b) =>
                  new Date(b.updatedAt || b.createdAt).getTime() -
                  new Date(a.updatedAt || a.createdAt).getTime(),
              )
              .slice(0, 6),
          );
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load recent videos.");
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
      <section className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading recent generations…
      </section>
    );
  }

  if (error) return <section role="status" className="mt-10 rounded-xl border border-border p-4 text-sm text-muted-foreground">Recent videos could not load. <Link href="/projects" className="underline underline-offset-2">Open Projects to retry</Link></section>;
  if (projects.length === 0) return null;

  return (
    <section className="mt-12 w-full">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-medium tracking-tight text-foreground">
          Recent Generations
        </h2>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          View all
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>

      <ul className="flex flex-col gap-1.5">
        {projects.map((project) => {
          const thumbnail = projectThumbnailUrl(project.id, project.formatMode);
          const href = projectHref(project.status, project.id);

          return (
            <li key={project.id}>
              <Link
                href={href}
                className="group flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-accent/60"
              >
                <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-zinc-800 ring-1 ring-white/8">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbnail}
                    alt=""
                    className="absolute inset-0 size-full object-cover opacity-80"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                    <Video className="size-4 text-white/90" strokeWidth={1.75} />
                  </span>
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-foreground">
                    {project.title || "Untitled"}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    {formatRelativeTime(project.updatedAt || project.createdAt)}
                  </span>
                </span>



                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
