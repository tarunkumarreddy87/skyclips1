/** True when the string looks like a durable S3 object key (not a URL). */
export function isObjectKey(src: string): boolean {
  if (!src) return false;
  if (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("/") ||
    src.startsWith("blob:") ||
    src.startsWith("data:")
  ) {
    return false;
  }
  return src.includes("/") || src.startsWith("projects/");
}

/**
 * Resolve asset URLs from API, MinIO, or absolute paths.
 * Bare S3 keys are not browser-playable — callers should prefer mediaUrls from the API.
 */
export function resolveMediaUrl(url: string): string {
  if (!url) return "";
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  ) {
    return url;
  }
  if (url.startsWith("/api/")) return url;
  if (url.startsWith("/")) {
    // Same-origin proxy avoids CORS / LAN IP mismatches for relative API media.
    if (url.startsWith("/editor-mock/")) return url;
    if (typeof window !== "undefined") return `/api${url}`;
    const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
    return `${API_BASE}${url}`;
  }
  // Bare object keys cannot be loaded as <img>/<video> src — return empty so UI shows fallback.
  if (isObjectKey(url)) return "";
  return url;
}

/** Prefer a playable URL; skip expired-looking keys that never resolved. */
export function resolveMediaUrlOrFallback(
  primary: string | undefined | null,
  ...fallbacks: Array<string | undefined | null>
): string {
  for (const candidate of [primary, ...fallbacks]) {
    if (!candidate) continue;
    const resolved = resolveMediaUrl(candidate);
    if (resolved) return resolved;
  }
  return "";
}
