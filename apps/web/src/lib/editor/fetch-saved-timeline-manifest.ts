import { fetchProjectTimeline } from "@/lib/api-client";

/** Latest persisted timeline manifest for render retries (queue/video pages). */
export async function fetchSavedTimelineManifest(
  projectId: string,
): Promise<Record<string, unknown>> {
  const { manifest } = await fetchProjectTimeline(projectId);
  return manifest;
}
