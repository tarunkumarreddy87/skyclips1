/**
 * Print estimated Remotion Lambda cost for a 10-minute 1080p render.
 *
 * Usage: pnpm lambda:estimate
 *
 * Remotion's published 10-min remote HD baseline (~$0.10) is the primary planning
 * number. estimatePrice() below is a rough GB-s model; measure live via
 * getRenderProgress().costs after the first successful cloud render.
 */

import { estimatePrice } from "@remotion/lambda";
import {
  FRAMES_PER_LAMBDA,
  FUNCTION_MEMORY_MB,
  LAMBDA_REGION,
  suggestedFramesPerLambda,
} from "./config";

function estimateTenMinute() {
  const durationSec = 600;
  const fps = 30;
  const totalFrames = durationSec * fps; // 18_000
  const framesPerLambda = suggestedFramesPerLambda(durationSec, fps);
  const lambdas = Math.ceil(totalFrames / framesPerLambda);
  const totalInvokes = lambdas + 1;
  const avgMs = 10_000;

  const unit = estimatePrice({
    region: LAMBDA_REGION,
    durationInMilliseconds: avgMs,
    memorySizeInMb: FUNCTION_MEMORY_MB,
    diskSizeInMb: 2048,
    lambdasInvoked: 1,
  });
  const modeled = unit * totalInvokes;

  console.log("=== 10-minute 1080p@30fps concurrency plan ===");
  console.log(`Total frames: ${totalFrames}`);
  console.log(`framesPerLambda: ${framesPerLambda} (env default ${FRAMES_PER_LAMBDA})`);
  console.log(`Approx frame lambdas: ${lambdas} (+ 1 stitch) = ${totalInvokes}`);
  console.log(`Memory: ${FUNCTION_MEMORY_MB} MB  region: ${LAMBDA_REGION}`);
  console.log("");
  console.log("=== Cost ===");
  console.log(`Modeled estimatePrice @ ${avgMs}ms × ${totalInvokes}: $${modeled.toFixed(3)}`);
  console.log("Remotion published baseline (10 min remote HD mp4, simple): ~$0.10–$0.11");
  console.log("HANUMAN documentary planning budget: $0.15–$0.45 until measured");
  console.log("Extras: S3 storage/egress, CloudWatch, Remotion company license (teams 4+)");
  console.log("Source of truth after first cloud render: getRenderProgress().costs.accruedSoFar");
}

estimateTenMinute();
