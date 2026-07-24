/**
 * RAF-coalesced playhead scrubbing — avoids 60+ zustand writes/sec while dragging.
 * Visual needle can update every pointer event; store commits ~30fps + final snap.
 */

export interface PlayheadScrubController {
  start: () => void;
  move: (ms: number) => void;
  end: (ms: number) => void;
  cancel: () => void;
  isDragging: () => boolean;
}

export function createPlayheadScrubController(opts: {
  setPlayhead: (ms: number) => void;
  /** Optional 60fps visual callback (e.g. imperative needle position). */
  onVisual?: (ms: number) => void;
  storeIntervalMs?: number;
}): PlayheadScrubController {
  const storeIntervalMs = opts.storeIntervalMs ?? 33;
  let dragging = false;
  let rafId = 0;
  let pendingMs: number | null = null;
  let lastStoreWrite = 0;

  const flush = (now: number) => {
    rafId = 0;
    if (pendingMs == null) return;
    const ms = pendingMs;
    if (now - lastStoreWrite >= storeIntervalMs) {
      lastStoreWrite = now;
      pendingMs = null;
      opts.setPlayhead(ms);
      return;
    }
    // Keep trying until the throttle window opens while still dragging.
    if (dragging) schedule();
  };

  const schedule = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(flush);
  };

  return {
    start() {
      dragging = true;
      lastStoreWrite = 0;
      pendingMs = null;
    },
    move(ms) {
      if (!dragging) return;
      pendingMs = ms;
      opts.onVisual?.(ms);
      schedule();
    },
    end(ms) {
      dragging = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      pendingMs = null;
      opts.onVisual?.(ms);
      opts.setPlayhead(ms);
    },
    cancel() {
      dragging = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      pendingMs = null;
    },
    isDragging: () => dragging,
  };
}
