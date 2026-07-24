import type { EditorState } from "./types";
import { buildTimelineManifestV1FromEditorState } from "./build-timeline-manifest";
import type { TimelineManifestV1 } from "./manifest-types";

export type RenderValidationIssue = {
  code: "empty_video_track" | "empty_audio_track" | "ghost_clip" | "empty_caption";
  message: string;
  itemId?: string;
};

/**
 * VidRush-style preflight: catch ghost / empty clips before enqueueing Remotion.
 * Ghost clips (missing media src) are the #1 cause of mid-render failures.
 */
/** Collect all advisory + blocking issues (for timeline warning triangle). */
export function listEditorValidationIssues(
  projectId: string,
  state: EditorState,
): RenderValidationIssue[] {
  const issues: RenderValidationIssue[] = [];
  const { timeline, assets } = state;

  for (const track of timeline.tracks) {
    if (track.hidden) continue;
    for (const item of track.items) {
      if (item.hidden) continue;

      if (item.type === "video" || item.type === "broll") {
        const asset = assets.find((a) => a.id === item.assetId);
        const src = asset?.metadata?.sourceKey || asset?.url || "";
        if (!src.trim()) {
          issues.push({
            code: "ghost_clip",
            itemId: item.id,
            message: `Empty visual clip “${item.label || item.id}” — replace media or delete it.`,
          });
        }
      }

      if (item.type === "narration" || item.type === "music" || item.type === "sfx") {
        const asset = assets.find((a) => a.id === item.assetId);
        const src = asset?.metadata?.sourceKey || asset?.url || "";
        if (!src.trim()) {
          issues.push({
            code: "ghost_clip",
            itemId: item.id,
            message: `Empty audio clip “${item.label || item.id}” — replace or delete it.`,
          });
        }
      }

      if ((item.type === "captions" || item.type === "text") && !String(item.text ?? "").trim()) {
        issues.push({
          code: "empty_caption",
          itemId: item.id,
          message: `Blank text “${item.label || item.id}” will be skipped on export.`,
        });
      }
    }
  }

  const manifest = buildTimelineManifestV1FromEditorState(projectId, state);
  if (manifest.tracks.video.length === 0) {
    issues.push({
      code: "empty_video_track",
      message: "Timeline has no video clips to render.",
    });
  }
  if (manifest.tracks.audio.length === 0) {
    issues.push({
      code: "empty_audio_track",
      message: "Timeline has no narration audio to render.",
    });
  }
  return issues;
}

export function validateEditorStateForRender(
  projectId: string,
  state: EditorState,
): { ok: true; manifest: TimelineManifestV1 } | { ok: false; issues: RenderValidationIssue[] } {
  const issues = listEditorValidationIssues(projectId, state);

  const manifest = buildTimelineManifestV1FromEditorState(projectId, state);
  const blocking = [...issues.filter(
    (i) =>
      i.code === "ghost_clip" ||
      i.code === "empty_video_track" ||
      i.code === "empty_audio_track",
  )];

  // Double-check manifest srcs (builder should have stripped ghosts already).
  for (const clip of [...manifest.tracks.video, ...(manifest.tracks.broll ?? [])]) {
    if (!clip.src?.trim()) {
      blocking.push({
        code: "ghost_clip",
        itemId: clip.id,
        message: `Manifest video/b-roll “${clip.id}” has empty src.`,
      });
    }
  }
  for (const clip of manifest.tracks.audio) {
    if (!clip.src?.trim()) {
      blocking.push({
        code: "ghost_clip",
        itemId: clip.id,
        message: `Manifest audio “${clip.id}” has empty src.`,
      });
    }
  }

  if (blocking.length) {
    return { ok: false, issues: blocking };
  }
  return { ok: true, manifest };
}
