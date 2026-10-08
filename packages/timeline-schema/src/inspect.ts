import { validateTimeline } from "./validate";

export type TimelineIssue = { path: string; message: string };

/** Schema first, then cross-element invariants which JSON Schema cannot express. */
export function inspectTimeline(data: unknown): TimelineIssue[] {
  if (!validateTimeline(data)) {
    return (validateTimeline.errors ?? []).map((error) => ({
      path: error.instancePath || "/",
      message: error.message ?? "Invalid timeline data",
    }));
  }
  const manifest = data as {
    metadata: { fps: number };
    tracks: Record<string, { id: string; start_sec: number; duration_sec: number }[]>;
    overlays?: { id: string }[];
    transitions?: { id: string; after_clip_id: string; duration_sec: number; enabled?: boolean; type: string }[];
  };
  const issues: TimelineIssue[] = [];
  const ids = new Set<string>();
  const checkId = (id: string, path: string) => {
    if (!id.trim() || ids.has(id)) issues.push({ path, message: `Empty or duplicate element id: ${id}` });
    ids.add(id);
  };
  for (const [track, clips] of Object.entries(manifest.tracks)) {
    clips.forEach((clip, i) => checkId(clip.id, `/tracks/${track}/${i}/id`));
  }
  manifest.overlays?.forEach((item, i) => checkId(item.id, `/overlays/${i}/id`));
  const videos = [...manifest.tracks.video].sort((a, b) => a.start_sec - b.start_sec);
  const boundaries = new Set<string>();
  manifest.transitions?.forEach((transition, i) => {
    const path = `/transitions/${i}`;
    checkId(transition.id, path + "/id");
    if (transition.enabled === false || transition.type === "cut") return;
    const index = videos.findIndex((clip) => clip.id === transition.after_clip_id);
    const outgoing = videos[index];
    const incoming = videos[index + 1];
    if (!outgoing || !incoming) {
      issues.push({ path, message: "Transition must reference a video clip followed by another clip." });
      return;
    }
    if (boundaries.has(outgoing.id)) issues.push({ path, message: "Multiple enabled transitions at the same cut." });
    boundaries.add(outgoing.id);
    if (Math.abs(outgoing.start_sec + outgoing.duration_sec - incoming.start_sec) > 1 / manifest.metadata.fps) {
      issues.push({ path, message: "Transition requires adjacent video clips; remove it or close the gap." });
    }
    if (transition.duration_sec > Math.min(outgoing.duration_sec, incoming.duration_sec)) {
      issues.push({ path, message: "Transition is longer than its adjacent clip." });
    }
  });
  return issues;
}
