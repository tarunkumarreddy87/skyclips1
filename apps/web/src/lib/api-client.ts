import type { Brief, EntryPath, FormatMode, Project, ProjectDetail, ProjectList, Quote, QuoteSectionOutline } from "@hanuman/shared-types";
import { getAccessToken } from "@/lib/supabase/access-token";
import { withRequestDeadline } from "@/lib/http/request-deadline";
import { dedupeFetch } from "@/lib/http/fetch-dedupe";
import { TtlCache } from "@/lib/http/ttl-cache";
import { setCachedMediaUrl } from "@/lib/http/media-request-cache";
import { rewriteToMediaCdn } from "@/lib/editor/media-url";
import { serverApiBaseUrl } from "@/lib/api-base-url";

function apiBaseUrl(): string {
  // Browser: same-origin proxy avoids CORS and network-IP mismatches.
  if (typeof window !== "undefined") {
    return "/api";
  }
  return serverApiBaseUrl();
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

export type ApiFetchInit = RequestInit & {
  /** Skip in-flight GET dedupe. */
  skipDedupe?: boolean;
  /**
   * Memory-cache TTL for successful GET JSON (ms).
   * Default: short TTL for GETs; 0 disables. Never caches secrets.
   */
  memoryTtlMs?: number;
  /** Retry count for transient GET failures (default 2). */
  retries?: number;
};

const getJsonCache = new TtlCache<unknown>(100);

/** Default memory TTL for idempotent GETs (project/timeline metadata). */
const DEFAULT_GET_MEMORY_TTL_MS = 8_000;

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
    return "The server could not complete this request. Please try again in a moment.";
  }
  return body || `Request failed: ${status}`;
}

function cacheKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

/** Apply CDN rewrite + short-lived key→URL cache for timeline mediaUrls maps. */
function hydrateMediaUrls(mediaUrls: Record<string, string> | undefined): Record<string, string> {
  if (!mediaUrls) return {};
  const out: Record<string, string> = {};
  for (const [key, url] of Object.entries(mediaUrls)) {
    const rewritten = rewriteToMediaCdn(url);
    out[key] = rewritten;
    if (key && rewritten && !key.startsWith("http")) {
      setCachedMediaUrl(key, rewritten);
    }
  }
  return out;
}

export async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const isGet = method === "GET";
  const memoryTtlMs =
    init?.memoryTtlMs !== undefined
      ? init.memoryTtlMs
      : isGet
        ? DEFAULT_GET_MEMORY_TTL_MS
        : 0;

  const url = `${apiBaseUrl()}${path}`;
  let authHeader: Record<string, string> = {};
  if (typeof window !== "undefined") {
    try {
      const token = await getAccessToken();
      if (token) authHeader = { Authorization: `Bearer ${token}` };
    } catch {
      /* Auth not configured or session missing — API may reject in production. */
    }
  }
  // Never return another session's cached project data after an account switch.
  const memKey = `${cacheKey(method, path)} ${authHeader.Authorization ?? "anonymous"}`;
  if (isGet && memoryTtlMs > 0) {
    const hit = getJsonCache.get(memKey);
    if (hit !== undefined) return hit as T;
  }
  let res: Response;
  try {
    res = await dedupeFetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
        ...init?.headers,
      },
      // Mutations must not be HTTP-cached; GETs use default browser heuristics
      // plus our short memory cache / in-flight dedupe (media lives on S3/CDN).
      cache: isGet ? "default" : "no-store",
      retries: init?.retries,
      // AbortSignal + shared inflight is unsafe across different controllers —
      // skip dedupe when a signal is attached (editor project switch).
      skipDedupe: init?.skipDedupe ?? Boolean(init?.signal),
    });
  } catch (err) {
    if (err && typeof err === "object" && (err as { name?: string }).name === "AbortError") {
      throw err;
    }
    throw new Error(
      "Cannot reach the video service right now. Please try again in a moment.",
    );
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(parseApiError(body, res.status));
  }
  const data = (await res.json()) as T;
  if (isGet && memoryTtlMs > 0) {
    getJsonCache.set(memKey, data, memoryTtlMs);
  }
  return data;
}

/** Drop short-lived GET JSON cache (e.g. after save / project switch). */
export function clearApiGetCache(): void {
  getJsonCache.clear();
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/health", { signal, memoryTtlMs: 3_000 });
}

export async function fetchReadiness(signal?: AbortSignal): Promise<ReadinessResponse> {
  return apiFetch<ReadinessResponse>("/health/ready", { signal, memoryTtlMs: 0 });
}

export async function listProjects(signal?: AbortSignal): Promise<ProjectList> {
  return apiFetch<ProjectList>("/projects", { signal, memoryTtlMs: 5_000 });
}

export async function getProject(id: string, signal?: AbortSignal): Promise<ProjectDetail> {
  return apiFetch<ProjectDetail>(`/projects/${id}`, { signal });
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
  clearApiGetCache();
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

export interface DeriveProxiesResponse {
  sourceKey: string;
  proxyKey: string;
  posterKey: string;
  spriteKey?: string | null;
  proxyUrl: string;
  posterUrl: string;
  spriteUrl?: string | null;
}

/** Generate (or reuse) 540p proxy + poster (+ sprite) for a video object key. */
export async function deriveMediaProxies(
  projectId: string,
  sourceKey: string,
  opts?: { force?: boolean; makeSprite?: boolean; signal?: AbortSignal },
): Promise<DeriveProxiesResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error("Timeout generating proxies")), 60000);
  if (opts?.signal) {
    if (opts.signal.aborted) controller.abort(opts.signal.reason);
    else opts.signal.addEventListener("abort", () => controller.abort(opts.signal?.reason), { once: true });
  }

  try {
    const res = await apiFetch<DeriveProxiesResponse>(
      `/projects/${projectId}/media/derive-proxies`,
      {
        method: "POST",
        body: JSON.stringify({
          sourceKey,
          force: opts?.force ?? false,
          makeSprite: opts?.makeSprite ?? true,
        }),
        signal: controller.signal,
      },
    );
    // Cache resolved URLs under durable keys (refresh via TTL / near-expiry).
    if (res.proxyKey && res.proxyUrl) setCachedMediaUrl(res.proxyKey, rewriteToMediaCdn(res.proxyUrl));
    if (res.posterKey && res.posterUrl) setCachedMediaUrl(res.posterKey, rewriteToMediaCdn(res.posterUrl));
    if (res.spriteKey && res.spriteUrl) setCachedMediaUrl(res.spriteKey, rewriteToMediaCdn(res.spriteUrl));
    return {
      ...res,
      proxyUrl: rewriteToMediaCdn(res.proxyUrl),
      posterUrl: rewriteToMediaCdn(res.posterUrl),
      spriteUrl: res.spriteUrl ? rewriteToMediaCdn(res.spriteUrl) : res.spriteUrl,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface ProxyStatusResponse {
  ready: DeriveProxiesResponse[];
  missing: string[];
}

/** Batch lookup of already-derived proxies (no FFmpeg work server-side). */
export async function fetchProxyStatus(
  projectId: string,
  sourceKeys: string[],
  opts?: { signal?: AbortSignal },
): Promise<ProxyStatusResponse> {
  if (!sourceKeys.length) return { ready: [], missing: [] };
  const res = await apiFetch<ProxyStatusResponse>(
    `/projects/${projectId}/media/proxy-status`,
    {
      method: "POST",
      body: JSON.stringify({ sourceKeys }),
      signal: opts?.signal,
    },
  );
  const ready = res.ready.map((entry) => {
    if (entry.proxyKey && entry.proxyUrl) {
      setCachedMediaUrl(entry.proxyKey, rewriteToMediaCdn(entry.proxyUrl));
    }
    if (entry.posterKey && entry.posterUrl) {
      setCachedMediaUrl(entry.posterKey, rewriteToMediaCdn(entry.posterUrl));
    }
    if (entry.spriteKey && entry.spriteUrl) {
      setCachedMediaUrl(entry.spriteKey, rewriteToMediaCdn(entry.spriteUrl));
    }
    return {
      ...entry,
      proxyUrl: rewriteToMediaCdn(entry.proxyUrl),
      posterUrl: rewriteToMediaCdn(entry.posterUrl),
      spriteUrl: entry.spriteUrl ? rewriteToMediaCdn(entry.spriteUrl) : entry.spriteUrl,
    };
  });
  return { ready, missing: res.missing };
}

export interface UpdateBriefInput {
  scriptS3Key?: string;
  targetDurationSec?: number;
  language?: string;
  modelId?: string;
  brandProfileId?: string;
}

export async function updateBrief(projectId: string, input: UpdateBriefInput): Promise<ProjectDetail> {
  clearApiGetCache();
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
  clearApiGetCache();
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
  clearApiGetCache();
  return apiFetch<Quote>(`/projects/${projectId}/quote`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function approveQuote(projectId: string, quoteId: string): Promise<Quote> {
  clearApiGetCache();
  return apiFetch<Quote>(`/projects/${projectId}/approve`, {
    method: "POST",
    body: JSON.stringify({ quoteId }),
  });
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
      templateMode?: "auto" | "manual";
      blocklistedTemplates?: string[];
      allowedTemplates?: string[];
    };
    signal?: AbortSignal;
  },
): Promise<StartGenerationResponse> {
  clearApiGetCache();
  return apiFetch<StartGenerationResponse>(`/projects/${projectId}/generate`, {
    method: "POST",
    body: opts?.brandCompliance
      ? JSON.stringify({ brandCompliance: opts.brandCompliance })
      : undefined,
    signal: opts?.signal,
  });
}

export async function startRender(
  projectId: string,
  timelineManifest?: unknown,
  signal?: AbortSignal,
): Promise<StartGenerationResponse> {
  clearApiGetCache();
  return apiFetch<StartGenerationResponse>(`/projects/${projectId}/render`, {
    method: "POST",
    body: timelineManifest ? JSON.stringify({ timelineManifest }) : undefined,
    signal,
  });
}

export async function getLatestRun(
  projectId: string,
  signal?: AbortSignal,
): Promise<GenerationRun | null> {
  return apiFetch<GenerationRun | null>(`/projects/${projectId}/runs/latest`, {
    signal,
    memoryTtlMs: 2_000,
  });
}

export async function listProgressEvents(
  projectId: string,
  runId?: string,
  signal?: AbortSignal,
): Promise<ProgressEvent[]> {
  const q = runId ? `?runId=${encodeURIComponent(runId)}` : "";
  return apiFetch<ProgressEvent[]>(`/projects/${projectId}/progress/events${q}`, {
    signal,
    memoryTtlMs: 0,
  });
}

export async function downloadVideo(
  projectId: string,
  signal?: AbortSignal,
  runId?: string,
): Promise<ArtifactResponse> {
  const query = runId ? `?runId=${encodeURIComponent(runId)}` : "";
  const res = await apiFetch<ArtifactResponse>(`/projects/${projectId}/video${query}`, {
    signal,
    memoryTtlMs: 0,
  });
  return { ...res, downloadUrl: rewriteToMediaCdn(res.downloadUrl) };
}

export async function fetchProjectTimeline(
  projectId: string,
  signal?: AbortSignal,
): Promise<TimelineApiResponse> {
  const res = await apiFetch<TimelineApiResponse>(`/projects/${projectId}/timeline`, {
    signal,
    // Timeline mediaUrls are time-sensitive (presign); keep memory TTL short.
    memoryTtlMs: 5_000,
  });
  return { ...res, mediaUrls: hydrateMediaUrls(res.mediaUrls) };
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
  clearApiGetCache();
  return apiFetch<SaveTimelineResponse>(`/projects/${projectId}/timeline`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function listTimelineSnapshots(
  projectId: string,
  signal?: AbortSignal,
): Promise<TimelineSnapshotMeta[]> {
  return apiFetch<TimelineSnapshotMeta[]>(`/projects/${projectId}/timeline/snapshots`, {
    signal,
  });
}

export async function restoreTimelineSnapshot(
  projectId: string,
  snapshotId: string,
): Promise<RestoreSnapshotResponse> {
  clearApiGetCache();
  const res = await apiFetch<RestoreSnapshotResponse>(
    `/projects/${projectId}/timeline/snapshots/${snapshotId}/restore`,
    { method: "POST" },
  );
  return { ...res, mediaUrls: hydrateMediaUrls(res.mediaUrls) };
}

export async function resetProjectTimeline(projectId: string): Promise<RestoreSnapshotResponse> {
  clearApiGetCache();
  const res = await apiFetch<RestoreSnapshotResponse>(`/projects/${projectId}/timeline/reset`, {
    method: "POST",
  });
  return { ...res, mediaUrls: hydrateMediaUrls(res.mediaUrls) };
}

export interface EditorAgentPlanRequest {
  modelId?: string;
  conversation?: Array<{ role: "user" | "assistant"; content: string }>;
  message: string;
  /** Fast = lower latency; Smart = higher-quality planning. */
  speed?: "fast" | "smart";
  referenceImageUrl?: string;
  context: {
    visualEvidence?: Array<{ assetId: string; timeMs: number; imageUrl: string }>;
    playheadMs: number;
    selectedItemId: string | null;
    selectedItemIds?: string[];
    filters?: Array<{ id: string; name: string }>;
    effects?: ReadonlyArray<{ id: string; name: string }>;
    soundLibrary?: Array<Record<string, unknown>>;
    selectedTransitionId: string | null;
    durationMs: number;
    summary: string;
    settings?: Record<string, unknown> | import("./editor/types").TimelineSettings;
    assets?: Array<Record<string, unknown>>;
    items?: Array<{ id: string; type: string; label: string; startMs: number; endMs: number }>;
    transitions?: Array<{ id: string; afterItemId: string; type: string; durationMs: number; enabled: boolean }>;
  };
}

export interface EditorAgentPlanResponse {
  modelUsed?: string | null;
  visionModelUsed?: string | null;
  reply: string;
  ops: Record<string, unknown>[];
  refused: boolean;
}

export async function planEditorAgentOps(
  projectId: string,
  body: EditorAgentPlanRequest,
  signal?: AbortSignal,
): Promise<EditorAgentPlanResponse> {
  return withRequestDeadline((boundedSignal) => apiFetch<EditorAgentPlanResponse>(`/projects/${projectId}/editor-agent/plan`, {
    method: "POST",
    body: JSON.stringify(body),
    signal: boundedSignal,
  }), 480000, signal);
}

export interface EditorModelCatalog {
  configured: boolean;
  defaultModel: string;
  visionModel: string;
  models: Array<{ id: string; name: string; vision: boolean; contextLength?: number }>;
}

export function getEditorModels(): Promise<EditorModelCatalog> {
  return apiFetch<EditorModelCatalog>("/editor-agent/models");
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
  signal?: AbortSignal,
): Promise<StockSearchResponse> {
  const params = new URLSearchParams({
    q,
    per_page: String(perPage),
  });
  return apiFetch<StockSearchResponse>(`/stock/photos?${params.toString()}`, {
    signal,
    memoryTtlMs: 30_000,
  });
}

const PROGRESS_POLL_INTERVAL_MS = 2_500;

/**
 * Live progress updates for a run.
 *
 * The API's SSE stream (`/projects/{id}/progress`) requires an Authorization
 * header, which EventSource cannot send — every connection 401s and
 * auto-reconnects in a loop. Poll the authenticated events endpoint instead
 * and emit events the subscriber hasn't seen. Events replayed from the first
 * tick are safe: consumers dedupe by id and filter by runId.
 */
export function subscribeProgress(
  projectId: string,
  onEvent: (event: ProgressEvent) => void,
): () => void {
  let cancelled = false;
  const seen = new Set<string>();
  const controller = new AbortController();

  let inFlight = false;
  const tick = async () => {
    if (cancelled || inFlight) return;
    inFlight = true;
    try {
      const events = await withRequestDeadline((signal) => listProgressEvents(projectId, undefined, signal), 10000, controller.signal);
      if (cancelled) return;
      for (const event of events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        onEvent(event);
      }
    } catch {
      // Transient network/auth failure — retry on the next tick.
    } finally {
      inFlight = false;
    }
  };

  void tick();
  const interval = setInterval(() => void tick(), PROGRESS_POLL_INTERVAL_MS);

  return () => {
    cancelled = true;
    controller.abort();
    clearInterval(interval);
  };
}

export type { Brief, Project, ProjectDetail, ProjectList, Quote, QuoteSectionOutline };

export function removeImageBackground(projectId: string, sourceKey: string) {
  return apiFetch<{s3Key: string; downloadUrl: string}>(`/projects/${projectId}/remove-background`, {method: "POST", body: JSON.stringify({sourceKey})});
}
