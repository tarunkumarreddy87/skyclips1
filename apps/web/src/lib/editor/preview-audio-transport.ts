/**
 * Robust HTMLAudioElement transport for editor preview.
 *
 * Design rules (these prevent the "voice repeating / stuttering" bug):
 *  1. syncPreviewAudio is idempotent per bus + clip — calling it repeatedly with the
 *     same clip/src/shouldPlay must NOT pause-seek-replay. It only acts on real changes.
 *  2. Drift correction never seeks BACKWARD while playing (that rewinds voice and sounds
 *     like a stutter/repeat). Only catch forward when audio lags; when audio leads,
 *     report so the playhead can catch up instead.
 *  3. Seeking while paused (scrubbing) is allowed and cheap.
 *  4. Preload narration/music/sfx while paused so Play is not a cold network start.
 */

export interface AudioBusRefs {
  audio: HTMLAudioElement;
  /** last clip id that was actively playing on this bus */
  activeClipIdRef: { current: string | null };
  /** whether this bus is currently in the "playing" transport state */
  wasPlayingRef: { current: boolean };
}

export type DriftCorrectionResult =
  | { action: "none" }
  | { action: "seek_forward" }
  | {
      action: "audio_ahead";
      /** Media element time in seconds (source file clock). */
      audioTimeSec: number;
    };

/** Shared gate: RAF playhead freezes until preview narration bus can play. */
let previewAudioGateBlocked = false;
const previewAudioGateListeners = new Set<() => void>();

export function isPreviewAudioGateBlocked(): boolean {
  return previewAudioGateBlocked;
}

export function setPreviewAudioGateBlocked(blocked: boolean): void {
  if (previewAudioGateBlocked === blocked) return;
  previewAudioGateBlocked = blocked;
  for (const fn of previewAudioGateListeners) fn();
}

export function subscribePreviewAudioGate(fn: () => void): () => void {
  previewAudioGateListeners.add(fn);
  return () => previewAudioGateListeners.delete(fn);
}

export function stopPreviewAudio(audio: HTMLAudioElement | null | undefined): void {
  if (!audio) return;
  delete audio.dataset.awaitingStart;
  try {
    audio.pause();
  } catch {
    /* ignore */
  }
  audio.muted = true;
  audio.volume = 0;
}

/**
 * Warm browser HTTP cache for upcoming narration URLs (unique, capped).
 * Does not attach to the live preview buses — those stay dedicated to active clips.
 */
export function warmPreviewAudioUrls(urls: string[], limit = 3): void {
  const seen = new Set<string>();
  let n = 0;
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const a = new Audio();
    a.preload = "metadata";
    a.src = url;
    n += 1;
    if (n >= limit) break;
  }
}

/**
 * Attach src and warm the browser buffer without playing.
 * Safe while paused — makes Play start with voice already buffered.
 *
 * IMPORTANT: do NOT re-call audio.load() when the same src is already attached and
 * the bus has buffered enough data (readyState >= HAVE_FUTURE_DATA). Calling load()
 * resets readyState to HAVE_NOTHING and forces a full re-buffer — which is the root
 * cause of "voice cuts in late": every play/pause toggle re-issued load() on an
 * already-warm bus, nuking the buffer right when the user pressed Play.
 */
export function preloadPreviewAudio(
  audio: HTMLAudioElement | null | undefined,
  src: string | null,
): void {
  if (!audio || !src) return;
  const prev = audio.dataset.src ?? "";
  const sameSrcAttached =
    prev === src && (audio.getAttribute("src") === src || audio.src === src);
  // Already attached and warm enough — leave it alone.
  if (sameSrcAttached && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
  audio.dataset.src = src;
  if (!sameSrcAttached) {
    if (audio.getAttribute("src") !== src && audio.src !== src) {
      audio.src = src;
    }
    audio.preload = "auto";
    try {
      audio.load();
    } catch {
      /* ignore */
    }
  }
}

const audioStartTokens = new WeakMap<HTMLAudioElement, number>();

function nextAudioStartToken(audio: HTMLAudioElement): number {
  const n = (audioStartTokens.get(audio) ?? 0) + 1;
  audioStartTokens.set(audio, n);
  return n;
}

function currentAudioStartToken(audio: HTMLAudioElement): number {
  return audioStartTokens.get(audio) ?? 0;
}

function waitForAudioCanPlay(audio: HTMLAudioElement, timeoutMs = 12_000): Promise<boolean> {
  if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      audio.removeEventListener("canplay", onReady);
      audio.removeEventListener("loadeddata", onReady);
      audio.removeEventListener("error", onErr);
      window.clearTimeout(timer);
      resolve(ok);
    };
    const onReady = () => done(true);
    const onErr = () => done(false);
    audio.addEventListener("canplay", onReady);
    audio.addEventListener("loadeddata", onReady);
    audio.addEventListener("error", onErr);
    const timer = window.setTimeout(
      () => done(audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA),
      timeoutMs,
    );
  });
}

/**
 * Sync one bus (narration / music / sfx). Safe to call from effects that re-run
 * on playhead/store changes — repeated calls with unchanged inputs are a no-op.
 *
 * State machine:
 *  - No clip / paused / no src  -> stop + mark not playing (keep dataset.src for resume).
 *  - Same clip+src, still playing -> volume/rate tweaks only (NO seek, NO replay).
 *  - New clip or new src -> (re)load, wait for canplay, seek to target, then play once.
 */
export function syncPreviewAudio(opts: {
  audio: HTMLAudioElement;
  src: string | null;
  shouldPlay: boolean;
  targetSec: number;
  volume: number;
  playbackRate: number;
  clipId: string | null;
  activeClipIdRef: { current: string | null };
  wasPlayingRef: { current: boolean };
  /** When true, freeze the editor playhead until this bus can play (narration only). */
  gatePlayhead?: boolean;
}): void {
  const {
    audio,
    src,
    shouldPlay,
    targetSec,
    volume,
    playbackRate,
    clipId,
    activeClipIdRef,
    wasPlayingRef,
    gatePlayhead = false,
  } = opts;

  // Stopped state — shut down the bus exactly once. Keep dataset.src so resume
  // does not cold-reload the same URL (fixes delayed voice on every Play).
  if (!shouldPlay || !src || !clipId) {
    nextAudioStartToken(audio); // cancel any in-flight canplay→play
    if (wasPlayingRef.current) {
      wasPlayingRef.current = false;
      activeClipIdRef.current = null;
    }
    if (gatePlayhead) setPreviewAudioGateBlocked(false);
    stopPreviewAudio(audio);
    return;
  }

  const prevSrc = audio.dataset.src ?? "";
  const srcChanged = prevSrc !== src;
  const clipChanged = activeClipIdRef.current !== clipId;
  // A bus that was stopped (paused/scrubbed) and is now resuming needs a seek+play.
  const resuming = !wasPlayingRef.current;
  const awaitingStart = Boolean(audio.dataset.awaitingStart === "1");

  // (Re)load only when the actual source URL changes.
  if (srcChanged) {
    audio.dataset.src = src;
    activeClipIdRef.current = clipId;
    wasPlayingRef.current = false;
    try {
      audio.pause();
    } catch {
      /* ignore */
    }
    if (audio.getAttribute("src") !== src && audio.src !== src) {
      audio.src = src;
    }
    audio.load();
  } else if (clipChanged) {
    // Different clip, same asset URL — just retarget without a full reload.
    activeClipIdRef.current = clipId;
    wasPlayingRef.current = false;
  }

  // Volume / rate are always safe to set every call — they never cause a restart.
  const vol = Math.max(0, Math.min(1, volume));
  audio.muted = vol <= 0.0001;
  audio.volume = vol;
  audio.playbackRate = playbackRate;

  // Do not release the visual clock from a later sync while this bus is still
  // waiting for the original canplay -> play sequence to complete.
  if (awaitingStart && !srcChanged && !clipChanged) {
    wasPlayingRef.current = true;
    if (gatePlayhead) setPreviewAudioGateBlocked(true);
    return;
  }

  const needsStart =
    resuming || srcChanged || clipChanged || audio.ended || (audio.paused && !awaitingStart);

  if (!needsStart) {
    wasPlayingRef.current = true;
    if (gatePlayhead) setPreviewAudioGateBlocked(false);
    return;
  }

  const startPlayback = (token: number) => {
    if (currentAudioStartToken(audio) !== token) return;
    delete audio.dataset.awaitingStart;
    try {
      const dur = audio.duration;
      const maxT = Number.isFinite(dur) && dur > 0 ? dur - 0.05 : targetSec + 1;
      audio.currentTime = Math.max(0, Math.min(targetSec, maxT));
    } catch {
      /* ignore seek before metadata */
    }
    wasPlayingRef.current = true;
    void audio
      .play()
      .then(() => {
        if (currentAudioStartToken(audio) !== token) return;
        if (gatePlayhead) setPreviewAudioGateBlocked(false);
      })
      .catch(() => {
        if (currentAudioStartToken(audio) !== token) return;
        delete audio.dataset.awaitingStart;
        if (gatePlayhead) setPreviewAudioGateBlocked(false);
      });
  };

  // Cold start or deep seek: wait until the element can play so voice is not silent
  // while the Remotion playhead races ahead.
  if (srcChanged || audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
    if (awaitingStart && !srcChanged && !clipChanged) {
      // Already waiting for canplay for this clip/src — do not stack waiters.
      return;
    }
    const token = nextAudioStartToken(audio);
    audio.dataset.awaitingStart = "1";
    wasPlayingRef.current = true;
    if (gatePlayhead) setPreviewAudioGateBlocked(true);
    void waitForAudioCanPlay(audio).then((ok) => {
      if (currentAudioStartToken(audio) !== token) return;
      if (!ok || !wasPlayingRef.current) {
        delete audio.dataset.awaitingStart;
        if (gatePlayhead) setPreviewAudioGateBlocked(false);
        return;
      }
      startPlayback(token);
    });
    return;
  }

  const token = nextAudioStartToken(audio);
  startPlayback(token);
}

/**
 * Coarse drift correction while already playing (1–2 Hz, not per frame).
 *
 * CRITICAL: never seek backward — rewinding the media element re-plays the last
 * half-second of voice ("stutter / repeat"). When audio leads the playhead, report
 * `audio_ahead` so the caller can advance the UI clock instead.
 */
export function driftCorrectAudio(
  audio: HTMLAudioElement | null,
  targetSec: number,
  thresholdSec = 0.55,
): DriftCorrectionResult {
  if (!audio || audio.paused || audio.ended) return { action: "none" };
  const delta = audio.currentTime - targetSec;
  if (Math.abs(delta) <= thresholdSec) return { action: "none" };

  // Audio behind playhead — skip forward to catch up (brief hitch, not a phrase repeat).
  if (delta < -thresholdSec) {
    try {
      audio.currentTime = Math.max(0, targetSec);
    } catch {
      /* ignore */
    }
    return { action: "seek_forward" };
  }

  // Audio ahead — do NOT rewind. Caller should catch the playhead up to the audio clock.
  return { action: "audio_ahead", audioTimeSec: audio.currentTime };
}

/**
 * Map a narration/music clip's source-file time back to timeline playhead ms.
 */
export function playheadFromAudioClock(opts: {
  clipStartMs: number;
  sourceStartMs: number;
  audioTimeSec: number;
}): number {
  const localMs = opts.audioTimeSec * 1000 - opts.sourceStartMs;
  return opts.clipStartMs + Math.max(0, localMs);
}
