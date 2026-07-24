import {
  restoreTimelineSnapshot,
  resetProjectTimeline,
  saveProjectTimeline,
  type TimelineSnapshotMeta,
} from "@/lib/api-client";
import { buildTimelineManifestV1FromEditorState } from "./build-timeline-manifest";
import { isEditorDocument, metaToHistory } from "./load-editor-state";
import { mapTimelineResponseToEditorState } from "./manifest-mapper";
import { withRefreshedCaptionWordClocks } from "./caption-groups";
import type { EditorState, HistorySnapshot } from "./types";
import type { TimelineManifestV1 } from "./manifest-types";
import { getProject } from "@/lib/api-client";

/** Slightly longer debounce + identity skip cut redundant Snapshot churn. */
const AUTOSAVE_DEBOUNCE_MS = 2500;

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let autosaveInFlight: Promise<void> | null = null;
let pendingSave = false;
/** Last successfully flushed editor fingerprint (per tab session). */
let lastFlushedFingerprint: string | null = null;
let lastFlushedAt: number | null = null;

function editorDocumentFromState(state: EditorState) {
  return {
    project: state.project,
    timeline: state.timeline,
    assets: state.assets,
  };
}

/**
 * Content identity for "is this worth a new remote snapshot?"
 * Omits volatile asset URLs (presign churn) — uses durable sourceKey when present.
 */
export function editorContentFingerprint(state: EditorState): string {
  const assets = state.assets.map((a) => ({
    id: a.id,
    label: a.label,
    mediaType: a.mediaType,
    sourceKey: a.metadata?.sourceKey ?? null,
    durationMs: a.durationMs ?? null,
  }));
  return JSON.stringify({
    timeline: state.timeline,
    assets,
    format: state.project.format,
  });
}

export function getLastFlushedFingerprint(): string | null {
  return lastFlushedFingerprint;
}

export function getLastFlushedAt(): number | null {
  return lastFlushedAt;
}

/** Call after hydrate/restore so we don't immediately re-upload identical docs. */
export function markEditorFlushed(state: EditorState): void {
  lastFlushedFingerprint = editorContentFingerprint(state);
  lastFlushedAt = Date.now();
}

export function resetAutosaveIdentity(): void {
  lastFlushedFingerprint = null;
  lastFlushedAt = null;
}

function applyHistory(history: TimelineSnapshotMeta[]): HistorySnapshot[] {
  return metaToHistory(history);
}

export function scheduleAutosave(
  getState: () => EditorState & { project: { id: string } },
  setSaveStatus: (status: "saving" | "saved" | "unsaved" | "error") => void,
  setHistory: (history: HistorySnapshot[]) => void,
): void {
  setSaveStatus("unsaved");
  pendingSave = true;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    void flushAutosave(getState, setSaveStatus, setHistory);
  }, AUTOSAVE_DEBOUNCE_MS);
}

export async function flushAutosave(
  getState: () => EditorState & { project: { id: string } },
  setSaveStatus: (status: "saving" | "saved" | "unsaved" | "error") => void,
  setHistory: (history: HistorySnapshot[]) => void,
): Promise<void> {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  if (autosaveInFlight) {
    pendingSave = true;
    await autosaveInFlight;
    if (!pendingSave) return;
  }

  const state = getState();
  const projectId = state.project.id;
  if (!projectId || process.env.NEXT_PUBLIC_EDITOR_USE_MOCK === "true") {
    markEditorFlushed(state);
    setSaveStatus("saved");
    pendingSave = false;
    return;
  }

  const fingerprint = editorContentFingerprint(state);
  if (fingerprint === lastFlushedFingerprint) {
    // Nothing changed since last successful flush — stay render-ready, skip S3 churn.
    pendingSave = false;
    setSaveStatus("saved");
    return;
  }

  pendingSave = false;
  setSaveStatus("saving");

  const run = (async () => {
    try {
      const latest = getState();
      const nextFp = editorContentFingerprint(latest);
      if (nextFp === lastFlushedFingerprint) {
        setSaveStatus("saved");
        return;
      }
      const timelineManifest = buildTimelineManifestV1FromEditorState(projectId, latest);
      const res = await saveProjectTimeline(projectId, {
        timelineManifest,
        editorDocument: editorDocumentFromState(latest),
        label: "Autosave",
        actionType: "autosave",
      });
      lastFlushedFingerprint = nextFp;
      lastFlushedAt = Date.now();
      setHistory(applyHistory(res.history));
      setSaveStatus("saved");
    } catch (err) {
      console.error("Autosave failed", err);
      setSaveStatus("error");
    } finally {
      autosaveInFlight = null;
      if (pendingSave) {
        await flushAutosave(getState, setSaveStatus, setHistory);
      }
    }
  })();

  autosaveInFlight = run;
  await run;
}

export async function restoreSnapshotRemote(
  projectId: string,
  snapshotId: string,
): Promise<{ state: EditorState; history: HistorySnapshot[] }> {
  const res = await restoreTimelineSnapshot(projectId, snapshotId);
  return hydrateFromRestore(projectId, res);
}

export async function resetTimelineRemote(
  projectId: string,
): Promise<{ state: EditorState; history: HistorySnapshot[] }> {
  const res = await resetProjectTimeline(projectId);
  return hydrateFromRestore(projectId, res);
}

async function hydrateFromRestore(
  projectId: string,
  res: {
    editorDocument: unknown;
    timelineManifest: Record<string, unknown>;
    mediaUrls: Record<string, string>;
    history: TimelineSnapshotMeta[];
    snapshot: TimelineSnapshotMeta;
  },
): Promise<{ state: EditorState; history: HistorySnapshot[] }> {
  const history = applyHistory(res.history);

  if (isEditorDocument(res.editorDocument)) {
    const assets = res.editorDocument.assets.map((asset) => {
      const key = asset.metadata?.sourceKey;
      if (key && res.mediaUrls[key]) {
        const url = res.mediaUrls[key];
        return {
          ...asset,
          url,
          thumbnailUrl: asset.mediaType === "image" ? url : asset.thumbnailUrl,
        };
      }
      return asset;
    });
    const byId = new Map(assets.map((a) => [a.id, a]));
    const timeline = withRefreshedCaptionWordClocks({
      ...res.editorDocument.timeline,
      tracks: res.editorDocument.timeline.tracks.map((track) => ({
        ...track,
        items: track.items.map((item) => {
          if (!("assetId" in item) || !item.assetId || !("thumbnailUrl" in item)) return item;
          const asset = byId.get(item.assetId);
          if (!asset || asset.mediaType !== "image") return item;
          const nextThumb = asset.thumbnailUrl || asset.url;
          if (!nextThumb || item.thumbnailUrl === nextThumb) return item;
          return { ...item, thumbnailUrl: nextThumb };
        }),
      })),
    });
    const state = {
      project: { ...res.editorDocument.project, id: projectId },
      timeline,
      assets,
      history,
    };
    markEditorFlushed(state);
    return { state, history };
  }

  const project = await getProject(projectId);
  const { state } = mapTimelineResponseToEditorState(project, {
    artifactId: res.snapshot.id,
    manifest: res.timelineManifest as unknown as TimelineManifestV1,
    mediaUrls: res.mediaUrls,
  });
  const next = { ...state, history };
  markEditorFlushed(next);
  return { state: next, history };
}
