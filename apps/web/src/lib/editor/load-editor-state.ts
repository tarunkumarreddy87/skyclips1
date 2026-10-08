import {
  getProject,
  fetchProjectTimeline,
  listTimelineSnapshots,
  type TimelineSnapshotMeta,
} from "@/lib/api-client";
import type { Asset, EditorProject, EditorState, HistorySnapshot, Timeline } from "./types";
import type { TimelineManifestV1 } from "./manifest-types";
import { createEditorState } from "./mock-data";
import { mapTimelineResponseToEditorState } from "./manifest-mapper";
import { withRefreshedCaptionWordClocks } from "./caption-groups";
import { EditorLoadError } from "./editor-load-error";
import { extractS3KeyOrPassthrough } from "./build-timeline-manifest";

/** Set when user opts into mock timeline after API is unreachable. */
let mockFallbackRequested = false;

/**
 * Handoff from the "Open editor" preloader to `store.init`, so the editor page
 * renders the timeline it already downloaded instead of fetching it twice.
 */
let preloaded: { projectId: string; state: EditorState; at: number } | null = null;

export function stashPreloadedEditorState(projectId: string, state: EditorState): void {
  preloaded = { projectId, state, at: Date.now() };
}

/** Consumed once; presigned mediaUrls go stale, so ignore anything older than the TTL. */
export function takePreloadedEditorState(
  projectId: string,
  maxAgeMs = 60_000,
): EditorState | null {
  if (!preloaded || preloaded.projectId !== projectId) return null;
  const fresh = Date.now() - preloaded.at <= maxAgeMs;
  const state = preloaded.state;
  preloaded = null;
  return fresh ? state : null;
}

export function clearPreloadedEditorState(): void {
  preloaded = null;
}

export function requestEditorMockFallback(): void {
  mockFallbackRequested = true;
}

function shouldUseMockEditor(): boolean {
  return process.env.NEXT_PUBLIC_EDITOR_USE_MOCK === "true" || mockFallbackRequested;
}

function isApiUnreachable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    /cannot reach the api/i.test(message) ||
    /failed to fetch/i.test(message) ||
    /networkerror/i.test(message) ||
    /ECONNREFUSED/i.test(message) ||
    /Internal Server Error/i.test(message) ||
    /Server error\. Check that Docker/i.test(message)
  );
}

function metaToHistory(snaps: TimelineSnapshotMeta[]): HistorySnapshot[] {
  return snaps.map((s) => ({
    id: s.id,
    label: s.label,
    createdAt: s.createdAt,
    actionType: s.actionType,
    isOriginal: s.isOriginal,
  }));
}

function isEditorDocument(
  doc: unknown,
): doc is { project: EditorProject; timeline: Timeline; assets: Asset[] } {
  if (!doc || typeof doc !== "object") return false;
  const d = doc as Record<string, unknown>;
  return Boolean(d.project && d.timeline && Array.isArray(d.assets));
}

/** Re-apply fresh mediaUrls so preview works after presigned URL expiry. */
export function refreshAssetUrls(assets: Asset[], mediaUrls: Record<string, string>): Asset[] {
  return assets.map((asset) => {
    const meta = { ...(asset.metadata || {}) };
    let url = asset.url;
    let thumbnailUrl = asset.thumbnailUrl;

    const sourceKey = meta.sourceKey;
    if (sourceKey && mediaUrls[sourceKey]) {
      url = mediaUrls[sourceKey];
      if (asset.mediaType === "image") thumbnailUrl = url;
    } else if (mediaUrls[asset.url]) {
      url = mediaUrls[asset.url];
    }

    const proxyKey = meta.proxyKey;
    if (proxyKey && mediaUrls[proxyKey]) {
      meta.proxyUrl = mediaUrls[proxyKey];
    }
    const posterKey = meta.posterKey;
    if (posterKey && mediaUrls[posterKey]) {
      meta.posterUrl = mediaUrls[posterKey];
      if (asset.mediaType === "video") {
        thumbnailUrl = mediaUrls[posterKey];
      }
    }
    const spriteKey = meta.spriteKey;
    if (spriteKey && mediaUrls[spriteKey]) {
      meta.spriteUrl = mediaUrls[spriteKey];
    }

    // Prefer refreshed poster over stale thumbnail when present.
    if (meta.posterUrl && asset.mediaType === "video") {
      thumbnailUrl = meta.posterUrl;
    }

    return {
      ...asset,
      url,
      thumbnailUrl,
      metadata: Object.keys(meta).length ? meta : asset.metadata,
    };
  });
}

/** Keep clip thumbnailUrl in sync with refreshed assets (Image/B-roll lane). */
export function refreshClipThumbnails(timeline: Timeline, assets: Asset[], oldAssets: Asset[] = assets, mediaUrls: Record<string, string> = {}): Timeline {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const graphicsSrcs = new Map<string, string>();
  for (const old of oldAssets) {
    const refreshed = byId.get(old.id);
    if (refreshed) { graphicsSrcs.set(old.url, refreshed.url); if (old.metadata?.sourceKey) graphicsSrcs.set(old.metadata.sourceKey, refreshed.url); }
  }
  return {
    ...timeline,
    settings: { ...timeline.settings, backgroundImage: timeline.settings.backgroundImage ? mediaUrls[extractS3KeyOrPassthrough(timeline.settings.backgroundImage)] ?? timeline.settings.backgroundImage : null },
    tracks: timeline.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) => {
        if (item.type === "animation" && item.graphic?.src) {
          const refreshed = mediaUrls[extractS3KeyOrPassthrough(item.graphic.src)] ?? graphicsSrcs.get(item.graphic.src);
          if (refreshed) return { ...item, graphic: { ...item.graphic, src: refreshed } };
        }
        if (!("assetId" in item) || !item.assetId) return item;
        const asset = byId.get(item.assetId);
        if (!asset) return item;
        const nextThumb =
          asset.mediaType === "image"
            ? asset.thumbnailUrl || asset.url
            : asset.mediaType === "video"
              ? asset.thumbnailUrl ||
                asset.metadata?.posterUrl ||
                asset.metadata?.spriteUrl ||
                ("thumbnailUrl" in item ? item.thumbnailUrl : undefined)
              : "thumbnailUrl" in item
                ? item.thumbnailUrl
                : undefined;
        if (!nextThumb || !("thumbnailUrl" in item)) return item;
        if (item.thumbnailUrl === nextThumb) return item;
        return { ...item, thumbnailUrl: nextThumb };
      }),
    })),
  };
}

/** Repair duplicate React keys left by older generators. */
function uniquifyTimelineItemIds(timeline: Timeline): Timeline {
  const seen = new Set<string>();
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      items: track.items.map((item, index) => {
        const base = item.id || `${track.type}-${index}`;
        let id = base;
        let n = 2;
        while (seen.has(id)) {
          id = `${base}-${n}`;
          n += 1;
        }
        seen.add(id);
        return id === item.id ? item : { ...item, id };
      }),
    })),
  };
}

/** Don't block editor open on a slow snapshot list — race with a short timeout. */
function snapshotsWithBudget(
  promise: Promise<TimelineSnapshotMeta[]>,
  budgetMs = 700,
): Promise<TimelineSnapshotMeta[]> {
  return Promise.race([
    promise,
    new Promise<TimelineSnapshotMeta[]>((resolve) => {
      setTimeout(() => resolve([]), budgetMs);
    }),
  ]);
}

export async function loadEditorState(
  projectId: string,
  opts?: { signal?: AbortSignal },
): Promise<EditorState> {
  if (shouldUseMockEditor()) {
    mockFallbackRequested = false;
    return createEditorState(projectId);
  }

  const signal = opts?.signal;

  // Timeline is the critical path. Project + snapshots run in parallel but must
  // not delay hydration when a saved editorDocument is already available.
  const projectPromise = getProject(projectId, signal);
  const timelinePromise = fetchProjectTimeline(projectId, signal);
  const snapshotsPromise = listTimelineSnapshots(projectId, signal).catch(
    () => [] as TimelineSnapshotMeta[],
  );

  let timeline;
  try {
    timeline = await timelinePromise;
  } catch (err) {
    if (isApiUnreachable(err)) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[editor] API unreachable during timeline fetch — loading mock timeline", err);
        return createEditorState(projectId);
      }
      throw new EditorLoadError(
        "API is not reachable. Start Docker (`make up`) and the API (`make api`), or open a local mock timeline to keep editing UI.",
        { code: "api_unreachable", canRetryGeneration: false },
      );
    }

    let projectStatus: string | undefined;
    let canRetry = false;
    try {
      const project = await projectPromise;
      projectStatus = project.status;
      canRetry =
        project.status === "failed" ||
        project.status === "approved" ||
        project.status === "completed";
    } catch {
      /* ignore secondary failure */
    }

    const message =
      err instanceof Error ? err.message : "Timeline manifest not found. Complete generation first.";
    throw new EditorLoadError(
      message.includes("Complete generation") || message.includes("Timeline not available")
        ? "This project does not have a timeline yet. Video generation must finish before the editor can open."
        : message,
      {
        code: "timeline_not_ready",
        projectStatus,
        canRetryGeneration: canRetry,
      },
    );
  }

  if (isEditorDocument(timeline.editorDocument)) {
    const snapshots = await snapshotsWithBudget(snapshotsPromise);
    const history = metaToHistory(snapshots);
    const assets = refreshAssetUrls(timeline.editorDocument.assets, timeline.mediaUrls);
    return {
      project: { ...timeline.editorDocument.project, id: projectId },
      timeline: uniquifyTimelineItemIds(
        withRefreshedCaptionWordClocks(
          refreshClipThumbnails(timeline.editorDocument.timeline, assets, timeline.editorDocument.assets, timeline.mediaUrls),
        ),
      ),
      assets,
      history:
        history.length > 0
          ? history
          : [
              {
                id: timeline.snapshotId ?? `hist-${projectId}`,
                label: "Saved edit",
                createdAt: new Date().toISOString(),
                actionType: "autosave",
              },
            ],
    };
  }

  // Manifest fallback — need project metadata for title/status mapping.
  let project;
  let snapshots: TimelineSnapshotMeta[];
  try {
    [project, snapshots] = await Promise.all([projectPromise, snapshotsPromise]);
  } catch (err) {
    if (isApiUnreachable(err)) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[editor] API unreachable — loading mock timeline", err);
        return createEditorState(projectId);
      }
      throw new EditorLoadError(
        "API is not reachable. Start Docker (`make up`) and the API (`make api`), or open a local mock timeline to keep editing UI.",
        { code: "api_unreachable", canRetryGeneration: false },
      );
    }
    throw err;
  }

  const history = metaToHistory(snapshots);
  const { state } = mapTimelineResponseToEditorState(project, {
    artifactId: timeline.artifactId,
    manifest: timeline.manifest as unknown as TimelineManifestV1,
    mediaUrls: timeline.mediaUrls,
  });

  return {
    ...state,
    history: history.length > 0 ? history : state.history,
  };
}

export { metaToHistory, isEditorDocument };
