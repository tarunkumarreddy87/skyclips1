import { randomUUID } from "node:crypto";
import type { RenderJobRecord, RenderJobStatus, StartRenderRequest } from "../types.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

export class JobStore {
  private jobs = new Map<string, RenderJobRecord>();
  private externalIndex = new Map<string, string>();

  create(input: StartRenderRequest): RenderJobRecord {
    if (input.externalId && this.externalIndex.has(input.externalId)) {
      const existingId = this.externalIndex.get(input.externalId)!;
      const existing = this.jobs.get(existingId);
      if (existing) return existing;
    }

    const now = new Date().toISOString();
    const job: RenderJobRecord = {
      id: randomUUID(),
      status: "queued",
      projectId: input.projectId,
      runId: input.runId,
      outputKey: input.outputKey,
      externalId: input.externalId,
      progress: 0,
      message: "Queued",
      costUsd: null,
      outputUrl: null,
      artifactUrl: null,
      error: null,
      retryCount: 0,
      maxRetries: config.RENDER_JOB_MAX_RETRIES,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      durationSec: null,
      framesPerLambda: null,
    };

    this.jobs.set(job.id, job);
    if (input.externalId) {
      this.externalIndex.set(input.externalId, job.id);
    }
    this.scheduleCleanup(job.id);
    return job;
  }

  get(id: string): RenderJobRecord | undefined {
    return this.jobs.get(id);
  }

  update(id: string, patch: Partial<RenderJobRecord>): RenderJobRecord | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    const updated: RenderJobRecord = {
      ...job,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(id, updated);
    return updated;
  }

  setStatus(id: string, status: RenderJobStatus, message?: string): RenderJobRecord | undefined {
    const patch: Partial<RenderJobRecord> = { status };
    if (message !== undefined) patch.message = message;
    if (status === "starting" && !this.jobs.get(id)?.startedAt) {
      patch.startedAt = new Date().toISOString();
    }
    if (status === "completed" || status === "failed" || status === "cancelled") {
      patch.completedAt = new Date().toISOString();
    }
    return this.update(id, patch);
  }

  listActive(): RenderJobRecord[] {
    return [...this.jobs.values()].filter(
      (j) => !["completed", "failed", "cancelled"].includes(j.status),
    );
  }

  delete(id: string): boolean {
    const job = this.jobs.get(id);
    if (job?.externalId) this.externalIndex.delete(job.externalId);
    return this.jobs.delete(id);
  }

  private scheduleCleanup(id: string): void {
    setTimeout(() => {
      const job = this.jobs.get(id);
      if (!job) return;
      if (["completed", "failed", "cancelled"].includes(job.status)) {
        this.delete(id);
        logger.debug({ jobId: id }, "Cleaned up completed render job");
      }
    }, config.RENDER_JOB_TTL_MS);
  }
}

export const jobStore = new JobStore();
