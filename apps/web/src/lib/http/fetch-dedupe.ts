/**
 * Shared fetch helpers: in-flight GET dedupe, bounded retry, AbortSignal.
 * Used by api-client; safe for idempotent GETs only.
 */

export type DedupeFetchOptions = RequestInit & {
  /** Skip sharing in-flight promises (default false for GET). */
  skipDedupe?: boolean;
  /** Max retries after the first attempt (GET / network / 502–504 only). */
  retries?: number;
  /** Base delay for exponential backoff (ms). */
  retryDelayMs?: number;
};

const inflight = new Map<string, Promise<Response>>();

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: string }).name;
  return name === "AbortError";
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

function requestKey(method: string, url: string): string {
  return `${method.toUpperCase()} ${url}`;
}

/**
 * fetch with optional in-flight GET dedupe + bounded backoff retry.
 * Retries only when the method is GET (or missing) and the failure is transient.
 */
export async function dedupeFetch(url: string, init?: DedupeFetchOptions): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const isGet = method === "GET";
  const retries = isGet ? (init?.retries ?? 2) : 0;
  const retryDelayMs = init?.retryDelayMs ?? 200;
  // A caller-owned signal must never cancel or inherit another caller's request.
  const skipDedupe = init?.skipDedupe === true || !isGet || Boolean(init?.signal);
  // Requests with different credentials/representations must never share bodies.
  const headers = [...new Headers(init?.headers).entries()].sort(([a], [b]) => a.localeCompare(b));
  const key = `${requestKey(method, url)} ${JSON.stringify(headers)} ${init?.credentials ?? "same-origin"}`;

  const run = async (): Promise<Response> => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (init?.signal?.aborted) {
        throw init.signal.reason ?? new DOMException("Aborted", "AbortError");
      }
      try {
        const { skipDedupe: _s, retries: _r, retryDelayMs: _d, ...fetchInit } = init ?? {};
        const res = await fetch(url, fetchInit);
        if (res.ok || !isRetryableStatus(res.status) || attempt === retries || !isGet) {
          return res;
        }
        // Retryable HTTP status — consume body so the connection can close, then backoff.
        await res.body?.cancel().catch(() => undefined);
      } catch (err) {
        lastErr = err;
        if (isAbortError(err) || attempt === retries || !isGet) throw err;
      }
      const delay = retryDelayMs * 2 ** attempt;
      await sleep(delay, init?.signal);
    }
    throw lastErr instanceof Error ? lastErr : new Error("Request failed");
  };

  if (skipDedupe) return run();

  const existing = inflight.get(key);
  if (existing) {
    // Clone so each caller can read the body independently.
    return existing.then((res) => res.clone());
  }

  const promise = run().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise.then((res) => res.clone());
}

/** Test / project-switch helper: drop shared in-flight map. */
export function clearInflightFetches(): void {
  inflight.clear();
}

/** Expose size for tests / diagnostics. */
export function inflightFetchCount(): number {
  return inflight.size;
}
