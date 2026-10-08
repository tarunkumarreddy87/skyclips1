/**
 * Best-effort expiry for AWS SigV4 query-string URLs.
 * Returns epoch ms, or null when the URL is not a recognizable presigned GET.
 */

export function parsePresignedExpiryMs(url: string): number | null {
  if (!url || (!url.includes("X-Amz-") && !url.includes("Signature="))) return null;
  try {
    const u = new URL(url);
    const expires = u.searchParams.get("X-Amz-Expires");
    const date = u.searchParams.get("X-Amz-Date");
    if (expires && date) {
      // X-Amz-Date is YYYYMMDDTHHMMSSZ
      const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(date);
      if (!m) return null;
      const issued = Date.UTC(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
        Number(m[6]),
      );
      const ttlSec = Number(expires);
      if (!Number.isFinite(ttlSec) || ttlSec <= 0) return null;
      return issued + ttlSec * 1000;
    }
    // Legacy / alternate: Expires as unix seconds
    const legacy = u.searchParams.get("Expires");
    if (legacy) {
      const sec = Number(legacy);
      if (Number.isFinite(sec) && sec > 1_000_000_000) return sec * 1000;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** True when URL is missing, unparsable, or within `skewMs` of expiry. */
export function isPresignedNearExpiry(url: string, skewMs = 120_000): boolean {
  const exp = parsePresignedExpiryMs(url);
  if (exp == null) return false;
  return Date.now() >= exp - skewMs;
}
