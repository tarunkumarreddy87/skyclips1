export type ProgressStageStatus = "started" | "completed" | "failed";

export interface ProgressEvent {
  id: string;
  runId: string;
  projectId: string;
  stage: string;
  status: ProgressStageStatus;
  percent?: number;
  message: string;
  artifactId?: string | null;
  artifactType?: string | null;
  timestamp: string;
}
