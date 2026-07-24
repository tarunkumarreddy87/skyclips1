/**
 * Job bridge for Temporal media worker (ADR 0009 Phase 3).
 *
 * Invoked by Python:
 *   pnpm exec tsx src/bridge/job.ts --job=/path/to/job.json
 *
 * Job JSON:
 *   {
 *     "engine": "remotion-local" | "remotion-lambda",
 *     "manifest": { ... timeline.v1 ... },
 *     "outputPath": "C:/tmp/final.mp4",
 *     "browserExecutable": "optional chrome path"
 *   }
 *
 * Emits NDJSON lines on stdout:
 *   {"type":"progress","percent":90,"message":"..."}
 *   {"type":"done","outputPath":"...","costUsd":0.01,"engine":"..."}
 *   {"type":"error","message":"..."}
 */

import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import {
  getFunctions,
  getRenderProgress,
  renderMediaOnLambda,
} from "@remotion/lambda/client";
import {
  ACCOUNT_CONCURRENCY_LIMIT,
  COMPOSITION_ID,
  FUNCTION_MEMORY_MB,
  FUNCTION_TIMEOUT_SEC,
  LAMBDA_REGION,
  TARGET_FRAME_LAMBDAS,
  planLambdaParallelism,
} from "../lambda/config";
import type { TimelineCompositionProps, TimelineManifestV1 } from "../lib/types";

interface BridgeJob {
  engine: "remotion-local" | "remotion-lambda";
  manifest: TimelineManifestV1;
  outputPath: string;
  browserExecutable?: string;
}

function emit(obj: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function loadJob(): BridgeJob {
  const arg = process.argv.find((a) => a.startsWith("--job="));
  if (!arg) {
    throw new Error("Missing --job=/path/to/job.json");
  }
  return JSON.parse(fs.readFileSync(arg.slice("--job=".length), "utf-8")) as BridgeJob;
}

async function renderLocal(job: BridgeJob) {
  const entry = path.resolve(__dirname, "../index.ts");
  emit({ type: "progress", percent: 86, message: "Bundling Remotion composition" });

  const serveUrl = await bundle({
    entryPoint: entry,
    onProgress: (p) => {
      if (p > 0.05 && p < 0.99) {
        emit({
          type: "progress",
          percent: 86 + Math.round(p * 4),
          message: `Bundling ${Math.round(p * 100)}%`,
        });
      }
    },
  });

  const inputProps: TimelineCompositionProps = { manifest: job.manifest };
  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps: inputProps as unknown as Record<string, unknown>,
  });

  emit({ type: "progress", percent: 90, message: "Rendering frames (local Remotion)" });

  fs.mkdirSync(path.dirname(job.outputPath), { recursive: true });

  const inDocker = fs.existsSync("/.dockerenv");
  const browserExecutable =
    job.browserExecutable ||
    process.env.REMOTION_BROWSER_EXECUTABLE ||
    null;

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: job.outputPath,
    inputProps: inputProps as unknown as Record<string, unknown>,
    browserExecutable,
    // Headless Chromium in Docker needs multi-process + software GL.
    chromiumOptions: inDocker
      ? {
          enableMultiProcessOnLinux: true,
          gl: "angle",
        }
      : undefined,
    onProgress: ({ progress }) => {
      emit({
        type: "progress",
        percent: 90 + Math.round(progress * 8),
        message: `Remotion local ${Math.round(progress * 100)}%`,
      });
    },
  });

  emit({
    type: "done",
    outputPath: job.outputPath,
    engine: "remotion-local",
    costUsd: null,
  });
}

async function renderLambda(job: BridgeJob) {
  const serveUrl = process.env.REMOTION_SERVE_URL;
  if (!serveUrl) {
    throw new Error("REMOTION_SERVE_URL required for remotion-lambda engine");
  }
  if (!process.env.REMOTION_AWS_ACCESS_KEY_ID || !process.env.REMOTION_AWS_SECRET_ACCESS_KEY) {
    throw new Error("REMOTION_AWS_ACCESS_KEY_ID / REMOTION_AWS_SECRET_ACCESS_KEY required");
  }

  const inputProps: TimelineCompositionProps = { manifest: job.manifest };
  const durationSec = job.manifest.metadata.duration_sec;
  const fps = job.manifest.metadata.fps;
  const plan = planLambdaParallelism({
    durationSec,
    fps,
    accountConcurrencyLimit: Number(
      process.env.REMOTION_ACCOUNT_CONCURRENCY_LIMIT || ACCOUNT_CONCURRENCY_LIMIT,
    ),
    targetFrameLambdas: Number(process.env.REMOTION_MAX_CONCURRENCY || TARGET_FRAME_LAMBDAS),
    timeoutSec: Number(process.env.REMOTION_FUNCTION_TIMEOUT_SEC || FUNCTION_TIMEOUT_SEC),
    memoryMb: Number(process.env.REMOTION_FUNCTION_MEMORY_MB || FUNCTION_MEMORY_MB),
    fixedFramesPerLambda: Number(process.env.REMOTION_FRAMES_PER_LAMBDA || 0) || undefined,
    concurrencyPerLambda: Number(process.env.REMOTION_CONCURRENCY_PER_LAMBDA || 2),
  });
  const framesPerLambda = plan.framesPerLambda;

  let functionName = process.env.REMOTION_FUNCTION_NAME;
  if (!functionName) {
    const functions = await getFunctions({ region: LAMBDA_REGION, compatibleOnly: true });
    if (!functions.length) {
      throw new Error("No Remotion Lambda function deployed (pnpm lambda:deploy)");
    }
    functionName = functions[0].functionName;
  }

  emit({ type: "progress", percent: 86, message: "Starting Remotion Lambda render" });

  const { renderId, bucketName } = await renderMediaOnLambda({
    region: LAMBDA_REGION,
    functionName,
    serveUrl,
    composition: COMPOSITION_ID,
    inputProps: inputProps as unknown as Record<string, unknown>,
    codec: "h264",
    imageFormat: "jpeg",
    maxRetries: 1,
    framesPerLambda,
    ...(plan.concurrencyPerLambda ? { concurrencyPerLambda: plan.concurrencyPerLambda } : {}),
    privacy: "private",
    downloadBehavior: { type: "download", fileName: "final.mp4" },
  });

  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const progress = await getRenderProgress({
      renderId,
      bucketName,
      functionName,
      region: LAMBDA_REGION,
    });

    const pct = 86 + Math.round((progress.overallProgress ?? 0) * 12);
    emit({
      type: "progress",
      percent: Math.min(98, pct),
      message: `Remotion Lambda ${Math.round((progress.overallProgress ?? 0) * 100)}%`,
      costUsd: progress.costs?.accruedSoFar ?? null,
    });

    if (progress.fatalErrorEncountered) {
      const msg = progress.errors?.map((e) => e.message).join("; ") || "Lambda render failed";
      throw new Error(msg);
    }
    if (progress.done) {
      if (!progress.outputFile) {
        throw new Error("Lambda render done but no outputFile URL");
      }
      emit({ type: "progress", percent: 98, message: "Downloading Lambda output" });
      fs.mkdirSync(path.dirname(job.outputPath), { recursive: true });
      const res = await fetch(progress.outputFile);
      if (!res.ok) {
        throw new Error(`Failed to download Lambda output: HTTP ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(job.outputPath, buf);
      emit({
        type: "done",
        outputPath: job.outputPath,
        engine: "remotion-lambda",
        costUsd: progress.costs?.accruedSoFar ?? null,
        outputUrl: progress.outputFile,
      });
      return;
    }
  }
}

async function main() {
  try {
    const job = loadJob();
    if (job.engine === "remotion-local") {
      await renderLocal(job);
    } else if (job.engine === "remotion-lambda") {
      await renderLambda(job);
    } else {
      throw new Error(`Unknown engine: ${(job as BridgeJob).engine}`);
    }
  } catch (err) {
    emit({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
  }
}

main();
