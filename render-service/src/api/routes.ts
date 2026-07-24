import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { jobStore } from "../jobs/job-store.js";
import { cancelRenderJob, startRenderJob } from "../jobs/render-worker.js";
import type { RenderJobRecord } from "../types.js";
import { logger } from "../utils/logger.js";

const startRenderSchema = z.object({
  manifest: z.record(z.string(), z.unknown()),
  outputKey: z.string().min(1),
  projectId: z.string().min(1),
  runId: z.string().min(1),
  externalId: z.string().optional(),
});

function toPublicJob(job: RenderJobRecord) {
  return {
    id: job.id,
    status: job.status,
    projectId: job.projectId,
    runId: job.runId,
    outputKey: job.outputKey,
    progress: job.progress,
    message: job.message,
    costUsd: job.costUsd,
    error: job.error,
    retryCount: job.retryCount,
    remotionRenderId: job.remotionRenderId ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    durationSec: job.durationSec,
  };
}

function toResultJob(job: RenderJobRecord) {
  return {
    ...toPublicJob(job),
    outputUrl: job.outputUrl,
    artifactUrl: job.artifactUrl,
  };
}

async function verifyApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!config.RENDER_SERVICE_API_KEY) return;
  const key = request.headers["x-api-key"] ?? request.headers.authorization?.replace(/^Bearer /, "");
  if (key !== config.RENDER_SERVICE_API_KEY) {
    return reply.code(401).send({ detail: "Unauthorized", code: "UNAUTHORIZED" });
  }
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", verifyApiKey);

  app.get("/health", async () => ({
    status: "ok",
    service: "render-service",
    engine: "remotion-lambda",
    lambdaReady: Boolean(
      config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY && config.REMOTION_SERVE_URL,
    ),
    activeJobs: jobStore.listActive().length,
  }));

  /** POST /render/start — queue a Lambda render job. */
  app.post("/render/start", async (request, reply) => {
    const parsed = startRenderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({
        detail: parsed.error.issues.map((i) => i.message).join("; "),
        code: "VALIDATION_ERROR",
      });
    }

    const { manifest, outputKey, projectId, runId, externalId } = parsed.data;

    // Validate timeline metadata
    const meta = manifest.metadata as Record<string, unknown> | undefined;
    if (!meta?.duration_sec || !meta?.fps) {
      return reply.code(422).send({
        detail: "manifest.metadata must include duration_sec and fps",
        code: "INVALID_MANIFEST",
      });
    }

    const job = startRenderJob({
      manifest: manifest as unknown as import("@hanuman/remotion-renderer/lib/types").TimelineManifestV1,
      outputKey,
      projectId,
      runId,
      externalId,
    });

    logger.info({ jobId: job.id, projectId, runId, outputKey }, "Render job queued");
    return reply.code(202).send({ renderId: job.id, job: toPublicJob(job) });
  });

  /** GET /render/:id/status — poll render progress. */
  app.get<{ Params: { id: string } }>("/render/:id/status", async (request, reply) => {
    const job = jobStore.get(request.params.id);
    if (!job) {
      return reply.code(404).send({ detail: "Render job not found", code: "NOT_FOUND" });
    }
    return { job: toPublicJob(job) };
  });

  /** GET /render/:id/result — final output URL when complete. */
  app.get<{ Params: { id: string } }>("/render/:id/result", async (request, reply) => {
    const job = jobStore.get(request.params.id);
    if (!job) {
      return reply.code(404).send({ detail: "Render job not found", code: "NOT_FOUND" });
    }
    if (job.status !== "completed") {
      return reply.code(409).send({
        detail: `Render not complete (status=${job.status})`,
        code: "NOT_READY",
        job: toPublicJob(job),
      });
    }
    return { job: toResultJob(job) };
  });

  /** DELETE /render/:id — cancel an in-flight render. */
  app.delete<{ Params: { id: string } }>("/render/:id", async (request, reply) => {
    const job = await cancelRenderJob(request.params.id);
    if (!job) {
      return reply.code(404).send({ detail: "Render job not found", code: "NOT_FOUND" });
    }
    logger.info({ jobId: job.id }, "Render job cancelled");
    return { job: toPublicJob(job) };
  });
}
