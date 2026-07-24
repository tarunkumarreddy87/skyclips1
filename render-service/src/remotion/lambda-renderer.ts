import type { TimelineCompositionProps, TimelineManifestV1 } from "@hanuman/remotion-renderer/lib/types";

import {

  ACCOUNT_CONCURRENCY_LIMIT,

  COMPOSITION_ID,

  FUNCTION_MEMORY_MB,

  FUNCTION_TIMEOUT_SEC,

  LAMBDA_REGION,

  TARGET_FRAME_LAMBDAS,

  planLambdaParallelism,

} from "@hanuman/remotion-renderer/lambda/config";

import {

  deleteRender,

  getFunctions,

  getRenderProgress,

  renderMediaOnLambda,

} from "@remotion/lambda/client";

import { config, applyRemotionEnv, assertLambdaReady } from "../config.js";

import type { LambdaRenderOutcome, RenderProgressEvent } from "../types.js";

import { logger } from "../utils/logger.js";



applyRemotionEnv();



export type ProgressCallback = (event: RenderProgressEvent) => void;



async function resolveFunctionName(): Promise<string> {

  if (config.REMOTION_FUNCTION_NAME) {

    return config.REMOTION_FUNCTION_NAME;

  }

  const functions = await getFunctions({

    region: LAMBDA_REGION,

    compatibleOnly: true,

  });

  if (!functions.length) {

    throw new Error(

      "No Remotion Lambda function deployed. Run: pnpm --filter @hanuman/render-service lambda:deploy",

    );

  }

  return functions[0].functionName;

}



function remotionParallelism(manifest: TimelineManifestV1) {

  return planLambdaParallelism({

    durationSec: manifest.metadata.duration_sec,

    fps: manifest.metadata.fps,

    accountConcurrencyLimit:

      config.REMOTION_ACCOUNT_CONCURRENCY_LIMIT ?? ACCOUNT_CONCURRENCY_LIMIT,

    targetFrameLambdas: config.REMOTION_MAX_CONCURRENCY || TARGET_FRAME_LAMBDAS,

    timeoutSec: config.REMOTION_FUNCTION_TIMEOUT_SEC || FUNCTION_TIMEOUT_SEC,

    memoryMb: config.REMOTION_FUNCTION_MEMORY_MB || FUNCTION_MEMORY_MB,

    fixedFramesPerLambda:

      config.REMOTION_FRAMES_PER_LAMBDA && config.REMOTION_FRAMES_PER_LAMBDA > 0

        ? config.REMOTION_FRAMES_PER_LAMBDA

        : undefined,

    concurrencyPerLambda: config.REMOTION_CONCURRENCY_PER_LAMBDA,

  });

}



/**

 * Trigger Remotion Lambda render and poll until complete.

 * Supports 5–60+ minute videos via parallel chunk Lambdas (framesPerLambda tuning).

 */

export async function renderOnLambda(params: {

  jobId: string;

  manifest: TimelineManifestV1;

  onProgress: ProgressCallback;

}): Promise<LambdaRenderOutcome> {

  const { jobId, manifest, onProgress } = params;

  assertLambdaReady();

  const serveUrl = config.REMOTION_SERVE_URL!;

  const functionName = await resolveFunctionName();

  const inputProps: TimelineCompositionProps = { manifest };

  const plan = remotionParallelism(manifest);

  const totalFrames = Math.round(manifest.metadata.duration_sec * manifest.metadata.fps);



  logger.info(

    {

      jobId,

      functionName,

      durationSec: manifest.metadata.duration_sec,

      totalFrames,

      framesPerLambda: plan.framesPerLambda,

      expectedFrameLambdas: plan.expectedFrameLambdas,

      concurrencyPerLambda: plan.concurrencyPerLambda ?? 1,

      accountConcurrencyLimit:

        config.REMOTION_ACCOUNT_CONCURRENCY_LIMIT ?? ACCOUNT_CONCURRENCY_LIMIT,

    },

    "Starting Remotion Lambda render",

  );



  onProgress({

    jobId,

    status: "starting",

    progress: 5,

    message: "Starting Remotion Lambda render",

    costUsd: null,

  });



  const { renderId, bucketName } = await renderMediaOnLambda({

    region: LAMBDA_REGION,

    functionName,

    serveUrl,

    composition: COMPOSITION_ID,

    inputProps: inputProps as unknown as Record<string, unknown>,

    codec: "h264",

    imageFormat: "jpeg",

    maxRetries: config.REMOTION_MAX_RETRIES,

    framesPerLambda: plan.framesPerLambda,

    ...(plan.concurrencyPerLambda ? { concurrencyPerLambda: plan.concurrencyPerLambda } : {}),

    privacy: "private",

    downloadBehavior: { type: "download", fileName: "final.mp4" },

  });



  logger.info({ jobId, renderId, bucketName, functionName }, "Lambda render accepted");



  onProgress({

    jobId,

    status: "rendering",

    progress: 10,

    message: "Lambda render in progress",

    costUsd: null,

  });



  for (;;) {

    await new Promise((r) => setTimeout(r, config.REMOTION_POLL_INTERVAL_MS));



    const progress = await getRenderProgress({

      renderId,

      bucketName,

      functionName,

      region: LAMBDA_REGION,

    });



    const overall = progress.overallProgress ?? 0;

    const pct = Math.min(95, 10 + Math.round(overall * 85));

    const costUsd = progress.costs?.accruedSoFar ?? null;



    onProgress({

      jobId,

      status: "rendering",

      progress: pct,

      message: `Remotion Lambda ${Math.round(overall * 100)}%`,

      costUsd,

    });



    if (progress.fatalErrorEncountered) {

      const msg =

        progress.errors?.map((e) => e.message).join("; ") || "Remotion Lambda render failed";

      throw new Error(msg);

    }



    if (progress.done) {

      if (!progress.outputFile) {

        throw new Error("Lambda render completed but outputFile is missing");

      }

      logger.info(

        { jobId, renderId, costUsd, outputFile: progress.outputFile.slice(0, 100) },

        "Lambda render complete",

      );

      return {

        outputUrl: progress.outputFile,

        costUsd,

        remotionRenderId: renderId,

        remotionBucketName: bucketName,

        functionName,

      };

    }

  }

}



/** Cancel an in-flight Remotion Lambda render. */

export async function cancelLambdaRender(params: {

  renderId: string;

  bucketName: string;

}): Promise<void> {

  await deleteRender({

    region: LAMBDA_REGION,

    bucketName: params.bucketName,

    renderId: params.renderId,

  });

  logger.info({ renderId: params.renderId }, "Cancelled Remotion Lambda render");

}

