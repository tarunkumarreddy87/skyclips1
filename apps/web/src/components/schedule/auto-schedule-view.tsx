"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Project } from "@hanuman/shared-types";
import {
  CalendarClock,
  Check,
  Loader2,
  Pencil,
  Send,
  Trash2,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { downloadVideo, listProjects } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  defaultScheduleWhen,
  loadConnectedAccounts,
  loadScheduleQueue,
  platformLabel,
  saveConnectedAccounts,
  saveScheduleQueue,
  SOCIAL_PLATFORMS,
  toDatetimeLocalValue,
  type ConnectedAccount,
  type PlatformId,
  type ScheduledPost,
} from "@/components/publish/social-platforms";

export function AutoScheduleView() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [queue, setQueue] = useState<ScheduledPost[]>([]);
  const [projectId, setProjectId] = useState("");
  const [hasVideo, setHasVideo] = useState(false);
  const [checkingVideo, setCheckingVideo] = useState(false);
  const [selected, setSelected] = useState<PlatformId[]>(["youtube"]);
  const [when, setWhen] = useState("");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("public");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setAccounts(loadConnectedAccounts());
    setQueue(loadScheduleQueue());
    setWhen(defaultScheduleWhen());
    let cancelled = false;
    (async () => {
      try {
        const result = await listProjects();
        if (cancelled) return;
        const items = [...result.items].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        setProjects(items);
        const preferred =
          items.find((p) => p.status === "completed") ??
          items.find((p) => p.status === "running") ??
          items[0];
        if (preferred) {
          setProjectId(preferred.id);
          setTitle(preferred.title);
          setCaption(`${preferred.title}\n\nMade with SkyClip`);
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Failed to load projects");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!projectId) {
      setHasVideo(false);
      return;
    }
    let cancelled = false;
    setCheckingVideo(true);
    (async () => {
      try {
        const video = await downloadVideo(projectId).catch(() => null);
        if (!cancelled) setHasVideo(Boolean(video));
      } finally {
        if (!cancelled) setCheckingVideo(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  );

  const readyProjects = useMemo(
    () => projects.filter((p) => p.status === "completed" || p.status === "running"),
    [projects],
  );

  const upcoming = useMemo(
    () =>
      queue
        .filter((q) => q.status === "scheduled")
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [queue],
  );

  const history = useMemo(
    () =>
      queue
        .filter((q) => q.status !== "scheduled")
        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()),
    [queue],
  );

  function toggle(id: PlatformId) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function onProjectChange(id: string) {
    setProjectId(id);
    const p = projects.find((x) => x.id === id);
    if (p) {
      setTitle(p.title);
      setCaption(`${p.title}\n\nMade with SkyClip`);
    }
    setEditingId(null);
  }

  function connectAccount(platformId: PlatformId) {
    const platform = SOCIAL_PLATFORMS.find((p) => p.id === platformId);
    if (!platform) return;
    if (accounts.some((a) => a.platformId === platformId)) {
      toast.message(`${platform.name} already connected`);
      return;
    }
    const next: ConnectedAccount[] = [
      ...accounts,
      {
        platformId,
        handle: `@skyclip_${platformId}`,
        connectedAt: new Date().toISOString(),
      },
    ];
    setAccounts(next);
    saveConnectedAccounts(next);
    toast.success(`${platform.name} connected (demo)`, {
      description: "Mock account — real OAuth is post-MVP (ADR 0006).",
    });
  }

  function disconnectAccount(platformId: PlatformId) {
    const next = accounts.filter((a) => a.platformId !== platformId);
    setAccounts(next);
    saveConnectedAccounts(next);
    toast.message(`${platformLabel(platformId)} disconnected`);
  }

  function persistQueue(next: ScheduledPost[]) {
    setQueue(next);
    saveScheduleQueue(next);
  }

  function resetForm() {
    setEditingId(null);
    setWhen(defaultScheduleWhen());
    setVisibility("public");
    if (selectedProject) {
      setTitle(selectedProject.title);
      setCaption(`${selectedProject.title}\n\nMade with SkyClip`);
    }
  }

  function onSchedule() {
    if (!selectedProject || selected.length === 0 || !when || !title.trim()) {
      toast.error("Pick a project, platforms, title, and time");
      return;
    }

    const missing = selected.filter((id) => !accounts.some((a) => a.platformId === id));
    if (missing.length > 0) {
      toast.error("Connect accounts first", {
        description: missing.map(platformLabel).join(", "),
      });
      return;
    }

    if (!hasVideo) {
      toast.message("No rendered MP4 yet", {
        description: "You can still queue; render before the scheduled time.",
      });
    }

    const payload: Omit<ScheduledPost, "id" | "createdAt" | "status"> = {
      projectId: selectedProject.id,
      projectTitle: selectedProject.title,
      platforms: selected,
      title: title.trim(),
      caption: caption.trim(),
      scheduledAt: new Date(when).toISOString(),
      visibility,
    };

    if (editingId) {
      const next = queue.map((q) =>
        q.id === editingId
          ? { ...q, ...payload, status: "scheduled" as const }
          : q,
      );
      persistQueue(next);
      toast.success("Schedule updated");
      resetForm();
      return;
    }

    const item: ScheduledPost = {
      id: crypto.randomUUID(),
      ...payload,
      createdAt: new Date().toISOString(),
      status: "scheduled",
    };
    persistQueue(
      [...queue, item].sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      ),
    );
    toast.success("Queued for auto-schedule", {
      description: "Saved in this browser until live social APIs ship.",
    });
    resetForm();
  }

  function startEdit(item: ScheduledPost) {
    setEditingId(item.id);
    setProjectId(item.projectId);
    setSelected(item.platforms);
    setTitle(item.title);
    setCaption(item.caption);
    setWhen(toDatetimeLocalValue(item.scheduledAt));
    setVisibility(item.visibility);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function removeItem(id: string) {
    persistQueue(queue.filter((q) => q.id !== id));
    if (editingId === id) resetForm();
  }

  function markPosted(id: string) {
    persistQueue(
      queue.map((q) => (q.id === id ? { ...q, status: "posted" as const } : q)),
    );
    toast.success("Marked as posted (demo)");
  }

  function clearUpcoming() {
    persistQueue(queue.filter((q) => q.status !== "scheduled"));
    toast.message("Cleared upcoming queue");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading schedule…
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-4xl space-y-8 pb-10">
      <div
        className="pointer-events-none absolute inset-x-0 -top-4 h-48 bg-[radial-gradient(ellipse_at_15%_0%,rgba(56,189,248,0.1),transparent_50%),radial-gradient(ellipse_at_85%_0%,rgba(34,197,94,0.08),transparent_45%)]"
        aria-hidden
      />

      <div className="relative">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Social
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Auto schedule</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Connect accounts, queue finished videos, and manage upcoming posts across YouTube,
          Facebook, Instagram, and LinkedIn.
        </p>
      </div>

      <section className="relative space-y-3">
        <h2 className="text-sm font-semibold">Connected accounts</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIAL_PLATFORMS.map((p) => {
            const Icon = p.Icon;
            const account = accounts.find((a) => a.platformId === p.id);
            return (
              <div
                key={p.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4",
                  account ? "border-primary/30 bg-primary/5" : "border-border/70 bg-card",
                )}
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{p.name}</p>
                    {account ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <Check className="size-3" />
                        Connected
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {account ? account.handle : p.blurb}
                  </p>
                  <div className="mt-3">
                    {account ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 px-2"
                        onClick={() => disconnectAccount(p.id)}
                      >
                        <Unplug className="size-3.5" />
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => connectAccount(p.id)}
                      >
                        {p.connect}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="relative space-y-4 rounded-2xl border border-border/70 bg-card/80 p-5 backdrop-blur-sm">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Send className="size-4" />
          {editingId ? "Edit schedule" : "New schedule"}
        </h2>

        <label className="block space-y-1.5 text-sm">
          <span className="text-muted-foreground">Video project</span>
          {projects.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No projects yet.{" "}
              <Link href="/studio" className="font-medium text-foreground underline">
                Create a video
              </Link>{" "}
              first.
            </p>
          ) : (
            <select
              value={projectId}
              onChange={(e) => onProjectChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {readyProjects.length > 0 ? (
                <optgroup label="Ready / in progress">
                  {readyProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} · {p.status}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <optgroup label="All projects">
                {projects.map((p) => (
                  <option key={`all-${p.id}`} value={p.id}>
                    {p.title} · {p.status}
                  </option>
                ))}
              </optgroup>
            </select>
          )}
        </label>

        {selectedProject ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {checkingVideo ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" />
                Checking render…
              </span>
            ) : hasVideo ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <Check className="size-3" />
                MP4 ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-600">
                <TriangleAlert className="size-3" />
                No MP4 yet —{" "}
                <Link href={`/projects/${selectedProject.id}/editor`} className="underline">
                  render in editor
                </Link>
              </span>
            )}
            <Link
              href={`/projects/${selectedProject.id}/publish`}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Project publish
            </Link>
            <Link
              href={`/projects/${selectedProject.id}/video`}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Video page
            </Link>
          </div>
        ) : null}

        <div className="space-y-2">
          <span className="text-sm text-muted-foreground">Platforms</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {SOCIAL_PLATFORMS.map((p) => {
              const Icon = p.Icon;
              const on = selected.includes(p.id);
              const connected = accounts.some((a) => a.platformId === p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm transition-colors",
                    on
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/70 bg-background hover:bg-muted/40",
                  )}
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{p.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {connected ? "Account ready" : "Connect above first"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="text-muted-foreground">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="text-muted-foreground">Caption / description</span>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">Post at</span>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">Visibility</span>
            <select
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as "public" | "unlisted" | "private")
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={onSchedule}
            disabled={!projectId || selected.length === 0 || !when || !title.trim()}
            className="gap-2"
          >
            <CalendarClock className="size-4" />
            {editingId
              ? "Update schedule"
              : `Schedule to ${selected.length} platform${selected.length === 1 ? "" : "s"}`}
          </Button>
          {editingId ? (
            <Button type="button" variant="outline" onClick={resetForm}>
              Cancel edit
            </Button>
          ) : null}
        </div>
      </section>

      <section className="relative space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Upcoming queue</h2>
          {upcoming.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearUpcoming}>
              Clear all
            </Button>
          ) : null}
        </div>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing scheduled yet. Connect accounts and queue a video above.
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                onEdit={() => startEdit(item)}
                onRemove={() => removeItem(item.id)}
                onMarkPosted={() => markPosted(item.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 ? (
        <section className="relative space-y-3">
          <h2 className="text-sm font-semibold">History</h2>
          <ul className="space-y-2">
            {history.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                onEdit={() => startEdit(item)}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function QueueRow({
  item,
  onEdit,
  onRemove,
  onMarkPosted,
}: {
  item: ScheduledPost;
  onEdit: () => void;
  onRemove: () => void;
  onMarkPosted?: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium">{item.title || item.projectTitle}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {new Date(item.scheduledAt).toLocaleString()} ·{" "}
          {item.platforms.map(platformLabel).join(", ")} · {item.visibility}
          {" · "}
          <span className="capitalize">{item.status}</span>
          {" · "}
          added {formatRelativeTime(item.createdAt)}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <Button variant="outline" size="sm" render={<Link href={`/projects/${item.projectId}/video`} />}>
          Video
        </Button>
        {item.status === "scheduled" ? (
          <>
            <Button variant="ghost" size="sm" className="gap-1" onClick={onEdit}>
              <Pencil className="size-3.5" />
              Edit
            </Button>
            {onMarkPosted ? (
              <Button variant="ghost" size="sm" onClick={onMarkPosted}>
                Mark posted
              </Button>
            ) : null}
          </>
        ) : null}
        <Button variant="ghost" size="sm" className="gap-1 text-destructive" onClick={onRemove}>
          <Trash2 className="size-3.5" />
          Remove
        </Button>
      </div>
    </li>
  );
}
