import type { Brief, EntryPath, FormatMode, Project, ProjectDetail, ProjectList, Quote, QuoteSectionOutline } from "@hanuman/shared-types";

function apiBaseUrl(): string {
  // Browser: same-origin proxy avoids CORS and network-IP mismatches.
  if (typeof window !== "undefined") {
    return "/api";
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
}

export interface HealthResponse {
  status: string;
  service: string;
}

export interface ReadinessResponse {
  status: string;
  database: boolean;
  redis: boolean;
}

function parseApiError(body: string, status: number): string {
  try {
    const json = JSON.parse(body) as {
      detail?: string | Array<{ msg?: string }> | { message?: string; code?: string };
    };
    if (typeof json.detail === "string") {
      return json.detail;
    }
    if (json.detail && typeof json.detail === "object" && !Array.isArray(json.detail)) {
      return json.detail.message ?? json.detail.code ?? "Request failed";
    }
    if (Array.isArray(json.detail)) {
      return json.detail.map((item) => item.msg ?? String(item)).join("; ");
    }
  } catch {
    /* plain-text error body */
  }
  if (body === "Internal Server Error") {
    return "Server error. Check that Docker is running (`make up`) and workers are started (`make orchestrator`, `make media`).";
  }
  return body || `Request failed: ${status}`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Cannot reach the API. Start Docker (make up), then run make api and make web.",
    );
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(parseApiError(body, res.status));
  }
  return res.json();
}

export async function fetchHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/health");
}

export async function fetchReadiness(): Promise<ReadinessResponse> {
  return apiFetch<ReadinessResponse>("/health/ready");
}

export async function listProjects(): Promise<ProjectList> {
  return apiFetch<ProjectList>("/projects");
}

export async function getProject(id: string): Promise<ProjectDetail> {
  return apiFetch<ProjectDetail>(`/projects/${id}`);
}

export interface CreateProjectInput {
  title: string;
  entryPath: EntryPath;
  formatMode: FormatMode;
  promptText?: string;
  scriptText?: string;
  targetDurationSec?: number;
  language?: string;
  modelId?: string;
  brandProfileId?: string;
}

export async function createProject(input: CreateProjectInput): Promise<ProjectDetail> {
  return apiFetch<ProjectDetail>("/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface UploadUrlResponse {
  uploadUrl: string;
  s3Key: string;
  expiresInSec: number;
  downloadUrl?: string | null;
}

export async function requestScriptUploadUrl(
  projectId: string,
  filename: string,
  contentType: string,
): Promise<UploadUrlResponse> {
  return apiFetch<UploadUrlResponse>(`/projects/${projectId}/upload-url`, {
    method: "POST",
    body: JSON.stringify({ filename, contentType }),
  });
}

/** Alias for editor media uploads (same endpoint; any project status). */
export const requestMediaUploadUrl = requestScriptUploadUrl;

export interface UpdateBriefInput {
  scriptS3Key?: string;
  targetDurationSec?: number;
  language?: string;
  modelId?: string;
  brandProfileId?: string;
}

export async function updateBrief(projectId: string, input: UpdateBriefInput): Promise<ProjectDetail> {
  return apiFetch<ProjectDetail>(`/projects/${projectId}/brief`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function uploadFileToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`);
  }
}

export async function generateQuote(projectId: string): Promise<Quote> {
  return apiFetch<Quote>(`/projects/${projectId}/quote`, { method: "POST" });
}

export interface UpdateQuoteInput {
  formatMode?: FormatMode;
  durationSec?: number;
  language?: string;
  voiceId?: string;
  modelId?: string;
  brandProfileId?: string;
  sectionOutline?: QuoteSectionOutline[];
}

export async function updateQuote(projectId: string, input: UpdateQuoteInput): Promise<Quote> {
  return apiFetch<Quote>(`/projects/${projectId}/quote`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function approveQuote(projectId: string): Promise<Quote> {
  return apiFetch<Quote>(`/projects/${projectId}/approve`, { method: "POST" });
}

export interface GenerationRun {
  id: string;
  projectId: string;
  quoteId: string;
  status: string;
  currentStage?: string | null;
  temporalRunId?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface StartGenerationResponse {
  run: GenerationRun;
  workflowId: string;
}

export interface ProgressEvent {
  id: string;
  runId: string;
  projectId: string;
  stage: string;
  status: string;
  percent?: number | null;
  message: string;
  artifactId?: string | null;
  artifactType?: string | null;
  timestamp: string;
}

export interface ArtifactResponse {
  id: string;
  projectId: string;
  runId?: string | null;
  type: string;
  downloadUrl: string;
  contentType: string;
  /** Probed MP4 duration after a successful render (authoritative). */
  durationSec?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface TimelineApiResponse {
  artifactId: string;
  manifest: Record<string, unknown>;
  mediaUrls: Record<string, string>;
  editorDocument?: EditorDocumentPayload | null;
  snapshotId?: string | null;
}

export interface EditorDocumentPayload {
  project: unknown;
  timeline: unknown;
  assets: unknown;
}

export interface TimelineSnapshotMeta {
  id: string;
  label: string;
  actionType: string;
  isOriginal: boolean;
  createdAt: string;
}

export interface SaveTimelineResponse {
  snapshot: TimelineSnapshotMeta;
  history: TimelineSnapshotMeta[];
}

export interface RestoreSnapshotResponse {
  snapshot: TimelineSnapshotMeta;
  editorDocument: EditorDocumentPayload | Record<string, never>;
  timelineManifest: Record<string, unknown>;
  mediaUrls: Record<string, string>;
  history: TimelineSnapshotMeta[];
}

export async function startGeneration(
  projectId: string,
  opts?: {
    brandCompliance?: {
      disableOverlays?: boolean;
      disableAnimations?: boolean;
      blocklistedTransitions?: string[];
    };
  },
): Promise<StartGenerationResponse> {
  return apiFetch<StartGenerationResponse>(`/projects/${projectId}/generate`, {
    method: "POST",
    body: opts?.brandCompliance
      ? JSON.stringify({ brandCompliance: opts.brandCompliance })
      : undefined,
  });
}

export async function startRender(
  projectId: string,
  timelineManifest?: unknown,
): Promise<StartGenerationResponse> {
  return apiFetch<StartGenerationResponse>(`/projects/${projectId}/render`, {
    method: "POST",
    body: timelineManifest ? JSON.stringify({ timelineManifest }) : undefined,
  });
}

export async function getLatestRun(projectId: string): Promise<GenerationRun | null> {
  return apiFetch<GenerationRun | null>(`/projects/${projectId}/runs/latest`);
}

export async function listProgressEvents(
  projectId: string,
  runId?: string,
): Promise<ProgressEvent[]> {
  const q = runId ? `?runId=${encodeURIComponent(runId)}` : "";
  return apiFetch<ProgressEvent[]>(`/projects/${projectId}/progress/events${q}`);
}

export async function downloadVideo(projectId: string): Promise<ArtifactResponse> {
  return apiFetch<ArtifactResponse>(`/projects/${projectId}/video`);
}

export async function fetchProjectTimeline(projectId: string): Promise<TimelineApiResponse> {
  return apiFetch<TimelineApiResponse>(`/projects/${projectId}/timeline`);
}

export async function saveProjectTimeline(
  projectId: string,
  body: {
    timelineManifest: unknown;
    editorDocument: EditorDocumentPayload;
    label?: string;
    actionType?: string;
  },
): Promise<SaveTimelineResponse> {
  return apiFetch<SaveTimelineResponse>(`/projects/${projectId}/timeline`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function listTimelineSnapshots(projectId: string): Promise<TimelineSnapshotMeta[]> {
  return apiFetch<TimelineSnapshotMeta[]>(`/projects/${projectId}/timeline/snapshots`);
}

export async function restoreTimelineSnapshot(
  projectId: string,
  snapshotId: string,
): Promise<RestoreSnapshotResponse> {
  return apiFetch<RestoreSnapshotResponse>(
    `/projects/${projectId}/timeline/snapshots/${snapshotId}/restore`,
    { method: "POST" },
  );
}

export async function resetProjectTimeline(projectId: string): Promise<RestoreSnapshotResponse> {
  return apiFetch<RestoreSnapshotResponse>(`/projects/${projectId}/timeline/reset`, {
    method: "POST",
  });
}

export interface EditorAgentPlanRequest {
  message: string;
  /** Fast = lower latency; Smart = higher-quality planning. */
  speed?: "fast" | "smart";
  context: {
    playheadMs: number;
    selectedItemId: string | null;
    selectedTransitionId: string | null;
    durationMs: number;
    summary: string;
  };
}

export interface EditorAgentPlanResponse {
  reply: string;
  ops: Record<string, unknown>[];
  refused: boolean;
}

export async function planEditorAgentOps(
  projectId: string,
  body: EditorAgentPlanRequest,
): Promise<EditorAgentPlanResponse> {
  return apiFetch<EditorAgentPlanResponse>(`/projects/${projectId}/editor-agent/plan`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface StockPhotoItem {
  id: string;
  label: string;
  url: string;
  thumbnailUrl: string;
  photographer?: string | null;
  source: string;
}

export interface StockSearchResponse {
  items: StockPhotoItem[];
  query: string;
  configured: boolean;
}

export async function searchStockPhotos(
  q: string,
  perPage = 24,
): Promise<StockSearchResponse> {
  const params = new URLSearchParams({
    q,
    per_page: String(perPage),
  });
  return apiFetch<StockSearchResponse>(`/stock/photos?${params.toString()}`);
}

export function subscribeProgress(projectId: string, onEvent: (event: ProgressEvent) => void): () => void {
  const source = new EventSource(`${apiBaseUrl()}/projects/${projectId}/progress`);

  source.addEventListener("progress", (e) => {
    try {
      const data = JSON.parse((e as MessageEvent).data) as ProgressEvent;
      onEvent(data);
    } catch {
      /* ignore malformed */
    }
  });

  return () => source.close();
}

export type { Brief, Project, ProjectDetail, ProjectList, Quote, QuoteSectionOutline };
