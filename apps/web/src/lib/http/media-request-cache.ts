/**
 * Short-lived cache for resolved media URLs (object key → playable URL)
 * and concurrent Image() / prefetch dedupe for editor filmstrips / thumbs.
 *
 * Do not store secrets. Presigned query strings are refreshed when near expiry.
 */

import { TtlCache } from "./ttl-cache";
import { isPresignedNearExpiry, parsePresignedExpiryMs } from "./presigned-expiry";

const urlByKey = new TtlCache<string>(500);
const imageInflight = new Map<string, Promise<string>>();
const imageReady = new Map<string, number>();

/** Default TTL when expiry cannot be parsed from the URL (e.g. CDN path). */
const DEFAULT_URL_TTL_MS = 3.5 * 60 * 60 * 1000;
/** Refresh skew — treat as stale this long before actual expiry. */
const REFRESH_SKEW_MS = 120_000;

export function getCachedMediaUrl(objectKey: string): string | undefined {
  const cached = urlByKey.get(objectKey);
  if (!cached) return undefined;
  if (isPresignedNearExpiry(cached, REFRESH_SKEW_MS)) {
    urlByKey.delete(objectKey);
    return undefined;
  }
  return cached;
}

export function setCachedMediaUrl(objectKey: string, url: string): void {
  if (!objectKey || !url) return;
  const exp = parsePresignedExpiryMs(url);
  const ttl =
    exp != null
      ? Math.max(5_000, exp - Date.now() - REFRESH_SKEW_MS)
      : DEFAULT_URL_TTL_MS;
  urlByKey.set(objectKey, url, ttl);
}

export function clearMediaUrlCache(): void {
  urlByKey.clear();
}

/**
 * Prefetch an image URL once; concurrent callers share the same Promise.
 * Warms the browser HTTP cache so CSS background-image / <img> reuse it.
 */
export function prefetchMediaImage(url: string): Promise<string> {
  if (!url || typeof window === "undefined") return Promise.resolve(url);
  if ((imageReady.get(url) ?? 0) > Date.now()) return Promise.resolve(url);
  imageReady.delete(url);
  const existing = imageInflight.get(url);
  if (existing) return existing;

  const promise = new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      imageInflight.delete(url);
      imageReady.set(url, Date.now() + 60_000);
      while (imageReady.size > 128) imageReady.delete(imageReady.keys().next().value!);
      resolve(url);
    };
    img.onerror = () => {
      imageInflight.delete(url);
      reject(new Error(`Failed to prefetch media image: ${url.slice(0, 80)}`));
    };
    img.src = url;
  });

  imageInflight.set(url, promise);
  return promise;
}

/** Soft-fail prefetch for UI paths (filmstrips). */
export function warmMediaImage(url: string): void {
  if (!url) return;
  void prefetchMediaImage(url).catch(() => undefined);
}

export function inflightMediaImageCount(): number {
  return imageInflight.size;
}

export function clearMediaImageInflight(): void {
  imageInflight.clear();
  imageReady.clear();
}
