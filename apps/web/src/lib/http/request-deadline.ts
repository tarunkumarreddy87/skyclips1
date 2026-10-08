/** Bound UI waits even when an upstream operation fails to settle after cancellation. */
export async function withRequestDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parent?: AbortSignal | null,
): Promise<T> {
  const controller = new AbortController();
  let rejectCancelled: (reason: unknown) => void = () => undefined;
  const cancelled = new Promise<never>((_, reject) => { rejectCancelled = reject; });
  const stop = (reason: unknown) => {
    controller.abort(reason);
    rejectCancelled(reason);
  };
  const onAbort = () => stop(parent?.reason ?? new DOMException("Request cancelled", "AbortError"));
  const timer = setTimeout(() => stop(new DOMException("Request timed out. Please retry.", "TimeoutError")), timeoutMs);
  parent?.addEventListener("abort", onAbort, { once: true });
  try {
    if (parent?.aborted) onAbort();
    return await Promise.race([
      cancelled,
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return operation(controller.signal);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onAbort);
  }
}
