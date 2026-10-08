import { useEditorStore } from "../store";
import { resolveMediaUrl } from "../media-url";

export interface VisualEvidence { assetId: string; timeMs: number; imageUrl: string }

/** Sparse frame inspection only; this does not transcribe or detect every shot. */
export async function collectVisualEvidence(message: string, opts?: { signal?: AbortSignal; itemIds?: string[] }): Promise<VisualEvidence[]> {
  if (!/\b(analy[sz]e|arrange|footage|scene|automatic|automatically|design|composition)\b/i.test(message) || typeof document === "undefined") return [];
  const store = useEditorStore.getState();
  opts?.signal?.throwIfAborted();
  const allItems = store.timeline.tracks.flatMap(track => track.items);
  const selected = opts?.itemIds?.length ? allItems.find(item => item.id === opts.itemIds![0]) : store.getSelectedItem();
  const selectedAsset = selected && "assetId" in selected ? store.getAsset(selected.assetId) : undefined;
  if (selectedAsset && selectedAsset.mediaType !== "video") return [];
  const focusMs = selected?.startMs ?? store.ui.playheadMs;
  const sceneClip = selectedAsset?.mediaType === "video" ? selected : allItems.find(item =>
    (item.type === "video" || item.type === "broll") && item.startMs <= focusMs && item.endMs > focusMs && store.getAsset(item.assetId)?.mediaType === "video");
  const sceneAsset = sceneClip && "assetId" in sceneClip ? store.getAsset(sceneClip.assetId) : undefined;
  const asset = sceneAsset ?? [...store.assets].reverse().find(candidate => candidate.mediaType === "video");
  if (!asset?.url) return [];
  const video = document.createElement("video");
  video.crossOrigin = "anonymous"; video.muted = true; video.preload = "metadata";
  const canvas = document.createElement("canvas");
  const waitFor = (event: "loadedmetadata" | "seeked") => new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error("Footage inspection timed out")), 4500);
    const finish = (error?: Error) => { window.clearTimeout(timer); video.removeEventListener(event, success); video.removeEventListener("error", failure); opts?.signal?.removeEventListener("abort", aborted); error ? reject(error) : resolve(); };
    const success = () => finish(); const failure = () => finish(new Error("Footage could not be inspected")); const aborted = () => finish(new Error("Footage inspection stopped"));
    video.addEventListener(event, success, { once: true }); video.addEventListener("error", failure, { once: true }); opts?.signal?.addEventListener("abort", aborted, { once: true }); if (opts?.signal?.aborted) aborted();
  });
  try {
    const metadata = waitFor("loadedmetadata"); video.src = resolveMediaUrl(asset.url); await metadata;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return [];
    const resize = Math.min(512 / Math.max(1, video.videoWidth), 288 / Math.max(1, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * resize)); canvas.height = Math.max(1, Math.round(video.videoHeight * resize));
    const ctx = canvas.getContext("2d"); if (!ctx) return [];
    const frames: VisualEvidence[] = [];
    const sourceStart = sceneClip && "sourceStartMs" in sceneClip ? (sceneClip.sourceStartMs ?? 0) / 1000 : 0;
    const windowLength = Math.max(0, Math.min(video.duration - sourceStart, sceneClip ? (sceneClip.endMs - sceneClip.startMs) / 1000 : video.duration));
    if (windowLength <= 0) return [];
    for (const ratio of [0.1, 0.5, 0.9]) {
      opts?.signal?.throwIfAborted();
      const sourceTime = Math.max(0, Math.min(video.duration - 0.01, sourceStart + windowLength * ratio));
      const seeking = waitFor("seeked"); video.currentTime = Math.max(0, sourceTime); await seeking;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageUrl = canvas.toDataURL("image/jpeg", 0.65); if (imageUrl.length > 334000) continue;
      frames.push({ assetId: asset.id, timeMs: Math.round(sourceTime * 1000), imageUrl });
    }
    return frames;
  } catch { return []; }
  finally { video.removeAttribute("src"); video.load(); }
}
