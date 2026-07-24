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

/** Set when user opts into mock timeline after API is unreachable. */
let mockFallbackRequested = false;

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
function refreshAssetUrls(assets: Asset[], mediaUrls: Record<string, string>): Asset[] {
  return assets.map((asset) => {
    const key = asset.metadata?.sourceKey;
    if (key && mediaUrls[key]) {
      const url = mediaUrls[key];
      return {
        ...asset,
        url,
        thumbnailUrl: asset.mediaType === "image" ? url : asset.thumbnailUrl,
      };
    }
    if (mediaUrls[asset.url]) {
      return { ...asset, url: mediaUrls[asset.url] };
    }
    return asset;
  });
}

/** Keep clip thumbnailUrl in sync with refreshed assets (Image/B-roll lane). */
function refreshClipThumbnails(timeline: Timeline, assets: Asset[]): Timeline {
  const byId = new Map(assets.map((a) => [a.id, a]));
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      items: track.items.map((item) => {
        if (!("assetId" in item) || !item.assetId) return item;
        const asset = byId.get(item.assetId);
        if (!asset) return item;
        const nextThumb =
          asset.mediaType === "image"
            ? asset.thumbnailUrl || asset.url
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

export async function loadEditorState(projectId: string): Promise<EditorState> {
  if (shouldUseMockEditor()) {
    mockFallbackRequested = false;
    return createEditorState(projectId);
  }

  // Timeline is the critical path. Project + snapshots run in parallel but must
  // not delay hydration when a saved editorDocument is already available.
  const projectPromise = getProject(projectId);
  const timelinePromise = fetchProjectTimeline(projectId);
  const snapshotsPromise = listTimelineSnapshots(projectId).catch(
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
          refreshClipThumbnails(timeline.editorDocument.timeline, assets),
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
