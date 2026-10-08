/**
 * "Open editor" preloader.
 *
 * Downloads the timeline, adopts any preview proxies that already exist, and
 * warms the first few seconds of media before navigation, so the editor opens
 * on a painted frame instead of an empty canvas that fills in for ~10s.
 */

import { fetchProxyStatus } from "@/lib/api-client";
import { withRequestDeadline } from "@/lib/http/request-deadline";
import { applyProxyMetaToAsset, assetNeedsProxy } from "./ensure-video-proxies";
import { loadEditorState, stashPreloadedEditorState } from "./load-editor-state";
import { resolveMediaUrl } from "./media-url";
import type { Asset, ClipItem, EditorState } from "./types";

export interface EditorPreloadProgress {
  /** 0–100. */
  percent: number;
  label: string;
}

/** Media inside this much of the timeline head is warmed before navigating. */
const WARM_WINDOW_MS = 12_000;
const MAX_WARM_ITEMS = 12;

function firstVisualUrls(state: EditorState): string[] {
  const byId = new Map(state.assets.map((a) => [a.id, a]));
  const clips = state.timeline.tracks
    .flatMap((t) => t.items)
    .filter((item): item is ClipItem => item.type === "video" || item.type === "broll")
    .filter((item) => !item.hidden && item.startMs <= WARM_WINDOW_MS)
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, MAX_WARM_ITEMS);

  const urls: string[] = [];
  for (const clip of clips) {
    const asset = byId.get(clip.assetId);
    if (!asset) continue;
    // Posters cover both cases: the image itself, and the still a video clip
    // shows until its proxy lands.
    const raw =
      asset.mediaType === "image"
        ? asset.url
        : asset.metadata?.posterUrl || asset.thumbnailUrl || "";
    const url = raw ? resolveMediaUrl(raw) : "";
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

function warmImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    const img = new window.Image();
    img.decoding = "async";
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    img.src = url;
    // Never let a dead URL hold the door shut.
    window.setTimeout(done, 4_000);
  });
}

async function adoptExistingProxies(
  projectId: string,
  assets: Asset[],
  signal?: AbortSignal,
): Promise<Asset[]> {
  const keys = [
    ...new Set(
      assets
        .filter(assetNeedsProxy)
        .map((a) => a.metadata?.sourceKey)
        .filter((k): k is string => Boolean(k)),
    ),
  ];
  if (!keys.length) return assets;

  const status = await fetchProxyStatus(projectId, keys, { signal });
  if (!status.ready.length) return assets;

  const patches = new Map(status.ready.map((entry) => [entry.sourceKey, entry]));
  return assets.map((asset) => {
    const key = asset.metadata?.sourceKey;
    const patch = key ? patches.get(key) : undefined;
    if (!patch) return asset;
    return applyProxyMetaToAsset(asset, {
      proxyKey: patch.proxyKey,
      posterKey: patch.posterKey,
      spriteKey: patch.spriteKey ?? undefined,
      proxyUrl: patch.proxyUrl,
      posterUrl: patch.posterUrl,
      spriteUrl: patch.spriteUrl ?? undefined,
    });
  });
}

/**
 * Runs the load with progress and stashes the result for `store.init`.
 * Rejects only when the timeline itself cannot load — the caller should surface
 * that instead of navigating into an editor that will just show the same error.
 */
export async function preloadEditorEntry(
  projectId: string,
  opts: { onProgress?: (p: EditorPreloadProgress) => void; signal?: AbortSignal } = {},
): Promise<void> {
  const { onProgress, signal } = opts;
  const report = (percent: number, label: string) => onProgress?.({ percent, label });

  report(6, "Loading timeline…");
  let state = await withRequestDeadline((boundedSignal) => loadEditorState(projectId, { signal: boundedSignal }), 30000, signal);
  if (signal?.aborted) return;

  report(48, "Checking preview clips…");
  try {
    const assets = await withRequestDeadline((boundedSignal) => adoptExistingProxies(projectId, state.assets, boundedSignal), 8000, signal);
    state = { ...state, assets };
  } catch {
    // Proxy lookup is an optimisation — the editor backfills it on open.
  }
  if (signal?.aborted) return;

  const urls = firstVisualUrls(state);
  report(62, urls.length ? "Loading media…" : "Preparing canvas…");
  let warmed = 0;
  await Promise.all(
    urls.map(async (url) => {
      await warmImage(url);
      warmed += 1;
      report(62 + Math.round((warmed / urls.length) * 34), "Loading media…");
    }),
  );
  if (signal?.aborted) return;

  stashPreloadedEditorState(projectId, state);
  report(100, "Opening editor…");
}
