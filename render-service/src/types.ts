import type { TimelineManifestV1 } from "@hanuman/shared-types";

export type RenderJobStatus = "queued" | "starting" | "rendering" | "copying" | "completed" | "failed" | "cancelled";

export interface StartRenderRequest {
  manifest: TimelineManifestV1;
  outputKey: string;
  projectId: string;
  runId: string;
  externalId?: string;
}

export interface RenderJobRecord {
  id: string;
  status: RenderJobStatus;
  projectId: string;
  runId: string;
  outputKey: string;
  externalId?: string;
  engine: "hanuman-native-v1";
  encoder: string | null;
  workerPid: number | null;
  /** Persisted until terminal completion, so a lost worker can restart from source. */
  manifest?: TimelineManifestV1;
  progress: number;
  message: string;
  costUsd: number | null;
  outputUrl: string | null;
  artifactUrl: string | null;
  error: string | null;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationSec: number | null;
}
