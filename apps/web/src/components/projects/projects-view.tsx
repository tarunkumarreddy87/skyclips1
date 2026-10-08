"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Grid3X3,
  List,
  Loader2,
  Plus,
  Search,
  Video,
} from "lucide-react";
import type { Project } from "@hanuman/shared-types";
import { listProjects } from "@/lib/api-client";
import { mockProjects } from "@/lib/mock-data";
import { projectHref, useMockProjectsList } from "@/lib/project-routes";
import { projectThumbnailUrl } from "@/lib/project-thumbnail";
import { formatRelativeTime, cn } from "@/lib/utils";
import { StatusBadge } from "@/components/projects/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ListItem = Project & { prompt?: string };



export function ProjectsView() {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [projects, setProjects] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const useMock = useMockProjectsList();

  useEffect(() => {
    setLoading(true);
    setError(null);
    let cancelled = false;
    const ac = new AbortController();
    const timeout = window.setTimeout(() => ac.abort(), 20_000);
    (async () => {
      if (useMock) {
        setProjects(
          mockProjects.map((p) => ({
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
        const result = await listProjects(ac.signal);
        if (!cancelled) setProjects(result.items);
      } catch (e) {
        if (!cancelled) {
          const aborted =
            (e && typeof e === "object" && (e as { name?: string }).name === "AbortError") ||
            ac.signal.aborted;
          setError(
            aborted
              ? "API timed out loading projects. Retry in a moment."
              : e instanceof Error
                ? e.message
                : "Failed to load projects",
          );
        }
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      ac.abort();
    };
  }, [useMock, retry]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Array.from(new Map(projects.map(p => [p.id, p])).values())
      .filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.prompt?.toLowerCase().includes(q) ?? false) ||
          p.formatMode.toLowerCase().includes(q),
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [projects, query]);

  return (
    <div className="relative min-h-full bg-background px-4 pb-12 pt-4 md:px-8 md:pt-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_at_20%_0%,rgba(59,130,246,0.08),transparent_55%),radial-gradient(ellipse_at_90%_0%,rgba(168,85,247,0.06),transparent_45%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-5xl space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Library
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">
              Projects
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Every production from prompt to final cut.
            </p>
          </div>
          <Button
            render={<Link href="/studio" />}
            className="gap-1.5 rounded-full bg-blue-600 px-4 text-white shadow-sm hover:bg-blue-500"
          >
            <Plus className="size-4" />
            New video
          </Button>
        </div>

        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              className="h-10 rounded-full border-border/70 bg-card/80 pl-9 backdrop-blur-sm"
            />
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border/70 bg-card/60 p-1">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon"
              className="size-8 rounded-full"
              onClick={() => setView("list")}
              aria-label="List view"
            >
              <List className="size-4" />
            </Button>
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="size-8 rounded-full"
              onClick={() => setView("grid")}
              aria-label="Grid view"
            >
              <Grid3X3 className="size-4" />
            </Button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading projects…
          </div>
        )}

        {error && <div role="alert" className="flex items-center gap-3 rounded-xl border border-destructive/25 p-4 text-sm text-destructive">{error}<Button variant="outline" onClick={() => setRetry(n => n + 1)}>Retry</Button></div>}

        {!loading && !error && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 px-6 py-16 text-center">
            <p className="font-display text-lg font-medium">{query.trim() ? "No matching projects" : "No projects yet"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first video from the studio home.
            </p>
            <Button render={<Link href="/studio" />} className="mt-5 rounded-full">
              Start creating
            </Button>
          </div>
        )}

        {view === "list" && filtered.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {filtered.map((project) => {
              const thumbnail = projectThumbnailUrl(project.id, project.formatMode);
              const href = projectHref(project.status, project.id);

              return (
                <li key={project.id}>
                  <Link
                    href={href}
                    className="group flex items-center gap-3 rounded-2xl border border-transparent px-2 py-2.5 transition-all hover:border-border/60 hover:bg-card/60"
                  >
                    <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border/60">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbnail}
                        alt=""
                        className="absolute inset-0 size-full object-cover opacity-85"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Video className="size-4 text-white/90" strokeWidth={1.75} />
                      </span>
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-foreground">
                        {project.title || "Untitled"}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] capitalize text-muted-foreground">
                        {project.formatMode} · {formatRelativeTime(project.updatedAt || project.createdAt)}
                      </span>
                      {project.prompt ? (
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">
                          {project.prompt}
                        </span>
                      ) : null}
                    </span>

                    <StatusBadge status={project.status} compact />

                    

                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}

        {view === "grid" && filtered.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => {
              const thumb = projectThumbnailUrl(project.id, project.formatMode);
              return (
                <Link
                  key={project.id}
                  href={projectHref(project.status, project.id)}
                  className="group block"
                >
                  <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-border group-hover:shadow-md">
                    <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumb}
                        alt=""
                        className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                      <div className="absolute right-3 top-3">
                        <StatusBadge status={project.status} compact />
                      </div>
                      <div className="absolute inset-x-0 bottom-0 p-3.5">
                        <p className="line-clamp-2 text-sm font-medium text-white">
                          {project.title}
                        </p>
                        <p className="mt-1 text-[11px] capitalize text-white/65">
                          {project.formatMode} · {formatRelativeTime(project.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
