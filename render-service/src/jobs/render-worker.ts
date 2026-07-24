import type { TimelineManifestV1 } from "@hanuman/remotion-renderer/lib/types";
import { config } from "../config.js";
import { copyRenderOutput } from "../lambda/s3-copy.js";
import { jobStore } from "./job-store.js";
import { cancelLambdaRender, renderOnLambda } from "../remotion/lambda-renderer.js";
import type { RenderJobRecord, StartRenderRequest } from "../types.js";
import { logger } from "../utils/logger.js";

class RenderWorkerPool {
  private active = 0;
  private queue: Array<{ jobId: string; manifest: TimelineManifestV1 }> = [];

  enqueue(job: RenderJobRecord, manifest: TimelineManifestV1): void {
    this.queue.push({ jobId: job.id, manifest });
    this.drain();
  }

  private drain(): void {
    while (this.active < config.RENDER_MAX_CONCURRENT && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) break;
      this.active += 1;
      this.runJob(next.jobId, next.manifest)
        .catch((err) => {
          logger.error({ err, jobId: next.jobId }, "Unhandled render worker error");
        })
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }

  private async runJob(jobId: string, manifest: TimelineManifestV1): Promise<void> {
    const job = jobStore.get(jobId);
    if (!job || job.status === "cancelled") return;

    jobStore.setStatus(jobId, "starting", "Preparing Remotion Lambda render");

    let lastOutcome: Awaited<ReturnType<typeof renderOnLambda>> | null = null;

    for (let attempt = 0; attempt <= job.maxRetries; attempt++) {
      if (attempt > 0) {
        jobStore.update(jobId, {
          retryCount: attempt,
          status: "starting",
          message: `Retry ${attempt}/${job.maxRetries}`,
          error: null,
        });
        logger.info({ jobId, attempt }, "Retrying Lambda render");
      }

      try {
        lastOutcome = await renderOnLambda({
          jobId,
          manifest,
          onProgress: (evt) => {
            jobStore.update(jobId, {
              status: evt.status,
              progress: evt.progress,
              message: evt.message,
              costUsd: evt.costUsd,
            });
          },
        });

        jobStore.update(jobId, {
          remotionRenderId: lastOutcome.remotionRenderId,
          remotionBucketName: lastOutcome.remotionBucketName,
          functionName: lastOutcome.functionName,
          outputUrl: lastOutcome.outputUrl,
          costUsd: lastOutcome.costUsd,
        });

        jobStore.setStatus(jobId, "copying", "Copying render output to artifacts bucket");

        const { artifactUrl } = await copyRenderOutput({
          outputUrl: lastOutcome.outputUrl,
          destKey: job.outputKey,
          remotionBucket: lastOutcome.remotionBucketName,
        });

        jobStore.update(jobId, {
          status: "completed",
          progress: 100,
          message: "Render complete",
          artifactUrl,
          durationSec: manifest.metadata.duration_sec,
          completedAt: new Date().toISOString(),
        });

        logger.info(
          {
            jobId,
            projectId: job.projectId,
            runId: job.runId,
            outputKey: job.outputKey,
            costUsd: lastOutcome.costUsd,
          },
          "Render job completed",
        );
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ jobId, attempt, error: message }, "Render attempt failed");

        const rateLimited = /rate exceeded|concurrency limit/i.test(message);
        if (rateLimited && attempt < job.maxRetries) {
          // Account ConcurrentExecutions is often 10; wait for stuck Lambdas to drain.
          const waitMs = Math.min(120_000, 15_000 * (attempt + 1));
          logger.warn({ jobId, attempt, waitMs }, "Rate limited — waiting before retry");
          jobStore.update(jobId, {
            retryCount: attempt + 1,
            status: "starting",
            message: `AWS Lambda busy (concurrency). Retrying in ${Math.round(waitMs / 1000)}s…`,
            error: message,
          });
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        if (attempt >= job.maxRetries) {
          jobStore.update(jobId, {
            status: "failed",
            progress: jobStore.get(jobId)?.progress ?? 0,
            message: "Render failed",
            error: message,
            completedAt: new Date().toISOString(),
          });
          return;
        }
      }
    }
  }
}

export const renderWorkerPool = new RenderWorkerPool();

export function startRenderJob(input: StartRenderRequest): RenderJobRecord {
  const job = jobStore.create(input);
  renderWorkerPool.enqueue(job, input.manifest);
  return job;
}

export async function cancelRenderJob(jobId: string): Promise<RenderJobRecord | undefined> {
  const job = jobStore.get(jobId);
  if (!job) return undefined;

  if (job.remotionRenderId && job.remotionBucketName) {
    try {
      await cancelLambdaRender({
        renderId: job.remotionRenderId,
        bucketName: job.remotionBucketName,
      });
    } catch (err) {
      logger.warn({ err, jobId }, "Failed to cancel Lambda render (may already be done)");
    }
  }

  return jobStore.update(jobId, {
    status: "cancelled",
    message: "Cancelled",
    completedAt: new Date().toISOString(),
  });
}
