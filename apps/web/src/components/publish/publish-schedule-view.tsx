"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarClock, Check, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { downloadVideo, getProject } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  defaultScheduleWhen,
  loadConnectedAccounts,
  loadScheduleQueue,
  saveConnectedAccounts,
  saveScheduleQueue,
  SOCIAL_PLATFORMS,
  type ConnectedAccount,
  type PlatformId,
  type ScheduledPost,
} from "@/components/publish/social-platforms";

export function PublishScheduleView({ projectId }: { projectId: string }) {
  const [title, setTitle] = useState("Loading…");
  const [hasVideo, setHasVideo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [selected, setSelected] = useState<PlatformId[]>(["youtube"]);
  const [when, setWhen] = useState("");
  const [caption, setCaption] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("public");

  useEffect(() => {
    setAccounts(loadConnectedAccounts());
    setWhen(defaultScheduleWhen());
    let cancelled = false;
    (async () => {
      try {
        const [project, video] = await Promise.all([
          getProject(projectId),
          downloadVideo(projectId).catch(() => null),
        ]);
        if (cancelled) return;
        setTitle(project.title);
        setPostTitle(project.title);
        setHasVideo(Boolean(video));
        setCaption(`${project.title}\n\nMade with SkyClip`);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load project");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function toggle(id: PlatformId) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function onConnect(platformId: PlatformId) {
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

  function onSchedule() {
    if (selected.length === 0 || !when || !postTitle.trim()) {
      toast.error("Pick platforms, a title, and a time");
      return;
    }
    const missing = selected.filter((id) => !accounts.some((a) => a.platformId === id));
    if (missing.length > 0) {
      toast.error("Connect accounts first", {
        description: missing
          .map((id) => SOCIAL_PLATFORMS.find((p) => p.id === id)?.name ?? id)
          .join(", "),
      });
      return;
    }
    if (!hasVideo) {
      toast.message("No rendered MP4 yet", {
        description: "Render from the editor before the scheduled time.",
      });
    }

    const item: ScheduledPost = {
      id: crypto.randomUUID(),
      projectId,
      projectTitle: title,
      platforms: selected,
      title: postTitle.trim(),
      caption: caption.trim(),
      scheduledAt: new Date(when).toISOString(),
      createdAt: new Date().toISOString(),
      status: "scheduled",
      visibility,
    };
    const queue = loadScheduleQueue();
    saveScheduleQueue(
      [...queue, item].sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      ),
    );
    toast.success("Queued for auto-schedule", {
      description: "Open Auto Schedule in the sidebar to manage the queue.",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading publish…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Publish & schedule
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Connect accounts and schedule this video. Manage the full queue from{" "}
            <Link href="/schedule" className="font-medium text-foreground underline">
              Auto Schedule
            </Link>
            .
          </p>
        </div>
        <Button variant="outline" render={<Link href={`/projects/${projectId}/video`} />}>
          Back to video
        </Button>
      </div>

      {!hasVideo ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p>
            No rendered MP4 yet.{" "}
            <Link href={`/projects/${projectId}/editor`} className="font-medium underline">
              Open the editor
            </Link>{" "}
            and click Render first.
          </p>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Accounts</h2>
        <div className="grid gap-3 sm:grid-cols-2">
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
                  "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                  on ? "border-primary/40 bg-primary/5" : "border-border/70 bg-card hover:bg-muted/40",
                )}
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{p.name}</span>
                    {connected ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <Check className="size-3" />
                        Connected
                      </span>
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          onConnect(p.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.stopPropagation();
                            onConnect(p.id);
                          }
                        }}
                        className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {p.connect}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{p.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border/70 bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="size-4" />
          Schedule
        </h2>
        <label className="block space-y-1.5 text-sm">
          <span className="text-muted-foreground">Title</span>
          <input
            value={postTitle}
            onChange={(e) => setPostTitle(e.target.value)}
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
        <div className="grid gap-3 sm:grid-cols-2">
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
        <Button type="button" onClick={onSchedule} disabled={selected.length === 0}>
          Schedule to {selected.length || 0} platform{selected.length === 1 ? "" : "s"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Demo queue only — live social posts ship post-MVP. Manage everything in Auto Schedule.
        </p>
      </section>
    </div>
  );
}
