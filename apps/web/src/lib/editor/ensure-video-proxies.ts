/**
 * Lazy / post-upload derive of preview proxies for video assets.
 * Non-blocking: editor opens with original fallback until proxies land.
 */

import { deriveMediaProxies, fetchProxyStatus } from "@/lib/api-client";
import type { Asset } from "./types";

export type ProxyMetaPatch = {
  proxyKey: string;
  posterKey: string;
  spriteKey?: string;
  proxyUrl: string;
  posterUrl: string;
  spriteUrl?: string;
};

export function assetNeedsProxy(asset: Asset): boolean {
  if (asset.mediaType !== "video") return false;
  const key = asset.metadata?.sourceKey;
  if (!key || key.startsWith("color:")) return false;
  if (asset.metadata?.proxyKey && asset.metadata?.proxyUrl) return false;
  return true;
}

/** Merge derive response into asset metadata + thumbnail. */
export function applyProxyMetaToAsset(asset: Asset, patch: ProxyMetaPatch): Asset {
  const metadata: Record<string, string> = {
    ...(asset.metadata || {}),
    proxyKey: patch.proxyKey,
    posterKey: patch.posterKey,
    proxyUrl: patch.proxyUrl,
    posterUrl: patch.posterUrl,
  };
  if (patch.spriteKey) metadata.spriteKey = patch.spriteKey;
  if (patch.spriteUrl) metadata.spriteUrl = patch.spriteUrl;
  return {
    ...asset,
    thumbnailUrl: patch.posterUrl || asset.thumbnailUrl,
    metadata,
  };
}

const isAbort = (err: unknown) =>
  Boolean(err) && typeof err === "object" && (err as { name?: string }).name === "AbortError";

/**
 * Make preview proxies available for video assets.
 *
 * Two phases, because the API derives one clip at a time (FFmpeg is CPU-bound):
 * 1. One batch HEAD lookup adopts everything already derived — the common case on
 *    reopen, and the difference between "video plays" and "poster slideshow".
 * 2. Only genuinely missing clips queue for derive, in the caller's order so the
 *    start of the timeline becomes playable first.
 *
 * `onAsset` fires per asset so the store can patch progressively. Failures are
 * swallowed; the clip keeps its poster fallback.
 */
export async function ensureVideoProxies(opts: {
  projectId: string;
  /** Ordered by timeline position — earlier clips become playable first. */
  assets: Asset[];
  onAsset: (assetId: string, patch: ProxyMetaPatch) => void;
  onProgress?: (ready: number, total: number) => void;
  /** Cap concurrent derives (API is CPU-bound). */
  concurrency?: number;
  /** Cancel in-flight derives on project switch / unmount. */
  signal?: AbortSignal;
}): Promise<void> {
  const { projectId, onAsset, onProgress, signal } = opts;
  const pending = opts.assets.filter(assetNeedsProxy);
  if (!pending.length || !projectId) return;

  const total = pending.length;
  let done = 0;
  const report = () => onProgress?.(done, total);
  report();

  const byKey = new Map<string, Asset[]>();
  for (const asset of pending) {
    const key = asset.metadata?.sourceKey;
    if (!key) continue;
    const list = byKey.get(key);
    if (list) list.push(asset);
    else byKey.set(key, [asset]);
  }
  const orderedKeys = [...byKey.keys()];
  if (!orderedKeys.length) return;

  const applyToKey = (sourceKey: string, patch: ProxyMetaPatch) => {
    for (const asset of byKey.get(sourceKey) ?? []) {
      onAsset(asset.id, patch);
      done += 1;
    }
    report();
  };

  let missing = orderedKeys;
  try {
    const status = await fetchProxyStatus(projectId, orderedKeys, { signal });
    if (signal?.aborted) return;
    for (const entry of status.ready) {
      applyToKey(entry.sourceKey, {
        proxyKey: entry.proxyKey,
        posterKey: entry.posterKey,
        spriteKey: entry.spriteKey ?? undefined,
        proxyUrl: entry.proxyUrl,
        posterUrl: entry.posterUrl,
        spriteUrl: entry.spriteUrl ?? undefined,
      });
    }
    const missingSet = new Set(status.missing);
    missing = orderedKeys.filter((key) => missingSet.has(key));
  } catch (err) {
    if (signal?.aborted || isAbort(err)) return;
    console.warn("[proxies] batch status failed; deriving individually", err);
  }

  if (!missing.length) return;

  // Server semaphore is 3; use 4 here so we always have a request queued when a slot frees.
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 3, 4));
  let idx = 0;

  const worker = async () => {
    while (idx < missing.length) {
      if (signal?.aborted) return;
      const sourceKey = missing[idx++];
      try {
        const res = await deriveMediaProxies(projectId, sourceKey, { signal });
        if (signal?.aborted) return;
        applyToKey(sourceKey, {
          proxyKey: res.proxyKey,
          posterKey: res.posterKey,
          spriteKey: res.spriteKey ?? undefined,
          proxyUrl: res.proxyUrl,
          posterUrl: res.posterUrl,
          spriteUrl: res.spriteUrl ?? undefined,
        });
      } catch (err) {
        if (signal?.aborted || isAbort(err)) return;
        console.warn("[proxies] derive failed for", sourceKey, err);
        // Count failures too, or the progress indicator never resolves.
        done += (byKey.get(sourceKey) ?? []).length;
        report();
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

/** Video assets in order of first appearance on the timeline, then the rest. */
export function orderAssetsByTimelineUse(assets: Asset[], usedAssetIdsInOrder: string[]): Asset[] {
  const rank = new Map<string, number>();
  usedAssetIdsInOrder.forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i);
  });
  return [...assets].sort(
    (a, b) =>
      (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}
