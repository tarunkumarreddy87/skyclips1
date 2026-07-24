import type { TimelineManifestV1 } from "@hanuman/remotion-renderer/lib/types";

export type RenderJobStatus =
  | "queued"
  | "starting"
  | "rendering"
  | "copying"
  | "completed"
  | "failed"
  | "cancelled";

export interface StartRenderRequest {
  /** Timeline manifest (timeline.v1) — clip src fields may be S3 keys or presigned URLs. */
  manifest: TimelineManifestV1;
  /** Destination object key in the artifacts bucket, e.g. projects/{id}/runs/{run}/final.mp4 */
  outputKey: string;
  projectId: string;
  runId: string;
  /** Optional idempotency key from caller (Temporal activity id). */
  externalId?: string;
}

export interface RenderJobRecord {
  id: string;
  status: RenderJobStatus;
  projectId: string;
  runId: string;
  outputKey: string;
  externalId?: string;
  /** Remotion Lambda render id (set once Lambda accepts the job). */
  remotionRenderId?: string;
  remotionBucketName?: string;
  functionName?: string;
  progress: number;
  message: string;
  costUsd: number | null;
  outputUrl: string | null;
  /** Presigned or public URL for the copied artifact in hanuman-artifacts. */
  artifactUrl: string | null;
  error: string | null;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationSec: number | null;
  framesPerLambda: number | null;
}

export interface RenderProgressEvent {
  jobId: string;
  status: RenderJobStatus;
  progress: number;
  message: string;
  costUsd: number | null;
}

export interface LambdaRenderOutcome {
  outputUrl: string;
  costUsd: number | null;
  remotionRenderId: string;
  remotionBucketName: string;
  functionName: string;
}
