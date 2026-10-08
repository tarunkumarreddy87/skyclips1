import { getCachedMediaUrl } from "@/lib/http/media-request-cache";
import { serverApiBaseUrl } from "@/lib/api-base-url";

/**
 * Resolve / rewrite media URLs for the editor.
 * When NEXT_PUBLIC_MEDIA_CDN_BASE_URL is set, browser-facing object URLs
 * prefer the CDN origin (CloudFront / Cloudflare → S3). Presigned query
 * strings are dropped when rewriting onto CDN (OAC/unsigned GETs).
 */

/** True when the string looks like a durable S3 object key (not a URL). */
export function isObjectKey(src: string): boolean {  if (!src) return false;
  if (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("/") ||
    src.startsWith("blob:") ||
    src.startsWith("data:")
    || src.startsWith("static:")
  ) {
    return false;
  }
  return src.includes("/") || src.startsWith("projects/");
}

/** CDN origin for media (no trailing slash). Empty = use S3/presign as returned by API. */
export function mediaCdnBase(): string {
  const raw =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MEDIA_CDN_BASE_URL) || "";
  return raw.trim().replace(/\/+$/, "");
}

/** Extract object key from a path-style or virtual-hosted object URL. */
function objectKeyFromUrl(u: URL): string | null {
  const path = u.pathname.replace(/^\/+/, "");
  if (!path || path.startsWith("api/")) return null;
  // Already an app object key (virtual-hosted / CDN / API-emitted).
  if (path.startsWith("projects/")) return path;
  // Path-style MinIO/S3: /{bucket}/projects/... → drop bucket segment.
  const parts = path.split("/");
  if (parts.length >= 2 && parts[1] === "projects") {
    return parts.slice(1).join("/");
  }
  return path;
}

/**
 * Rewrite an absolute S3/MinIO URL onto the CDN host when configured.
 * Object keys become `{cdn}/{key}`. Presign query strings are not forwarded.
 */
export function rewriteToMediaCdn(url: string): string {
  const base = mediaCdnBase();
  if (!base || !url) return url;
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  if (url.startsWith(base)) return url;

  if (isObjectKey(url)) {
    return `${base}/${url.replace(/^\/+/, "")}`;
  }

  try {
    const u = new URL(url);
    const host = u.hostname;
    const looksLikeObjectStore =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.includes("amazonaws.com") ||
      host.includes("cloudfront.net") ||
      host.includes("minio") ||
      u.port === "9000" ||
      u.port === "9001";
    if (!looksLikeObjectStore && !u.searchParams.has("X-Amz-Algorithm")) {
      return url;
    }
    const key = objectKeyFromUrl(u);
    if (!key) return url;
    return `${base}/${key}`;
  } catch {
    return url;
  }
}

/**
 * Resolve asset URLs from API, MinIO, CDN, or absolute paths.
 * Bare S3 keys are not browser-playable — callers should prefer mediaUrls from the API.
 */
export function resolveMediaUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("static:sfx/")) return "/" + url.slice(7);
  if (url.startsWith("/sfx/")) return url;
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  ) {
    return rewriteToMediaCdn(url);
  }
  if (url.startsWith("/api/")) return url;
  if (url.startsWith("/")) {
    // Same-origin proxy avoids CORS / LAN IP mismatches for relative API media.
    if (url.startsWith("/editor-mock/")) return url;
    if (typeof window !== "undefined") return `/api${url}`;
    const API_BASE = serverApiBaseUrl();
    return `${API_BASE}${url}`;
  }
  // Bare object keys: CDN can serve them when configured; otherwise not playable.
  if (isObjectKey(url)) {
    const cdn = mediaCdnBase();
    if (cdn) return `${cdn}/${url.replace(/^\/+/, "")}`;
    return "";
  }
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
