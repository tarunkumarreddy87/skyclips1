/**
 * Remotion Lambda configuration for HANUMAN (ADR 0009 Phase 2).
 *
 * Region: us-east-1 (matches .env S3_REGION placeholder; use real AWS, not MinIO).
 * Credentials: REMOTION_AWS_ACCESS_KEY_ID + REMOTION_AWS_SECRET_ACCESS_KEY
 *   (see https://www.remotion.dev/docs/lambda/setup)
 */

import { planLambdaParallelism } from "./parallelism";

export { planLambdaParallelism } from "./parallelism";
export type { LambdaParallelismPlan } from "./parallelism";

export const LAMBDA_REGION = (process.env.REMOTION_AWS_REGION ||
  process.env.S3_REGION ||
  "us-east-1") as
  | "us-east-1"
  | "us-east-2"
  | "us-west-1"
  | "us-west-2"
  | "eu-central-1"
  | "eu-west-1"
  | "eu-west-2"
  | "ap-southeast-1"
  | "ap-southeast-2"
  | "ap-northeast-1"
  | "ap-south-1";

/** Stable site name — redeploy overwrites. */
export const SITE_NAME = process.env.REMOTION_SITE_NAME || "hanuman-timeline";

/** Remotion composition id registered in Root.tsx */
export const COMPOSITION_ID = "TimelineComposition";

/**
 * Memory / timeout for the render Lambda function.
 * 3008 MB ≈ 1.8 vCPU; 900s is AWS Lambda max — required for long chunk safety.
 * Function name encodes mem+timeout (redeploy to refresh stale "120sec" names).
 */
export const FUNCTION_MEMORY_MB = Number(process.env.REMOTION_FUNCTION_MEMORY_MB || 3008);
export const FUNCTION_TIMEOUT_SEC = Number(process.env.REMOTION_FUNCTION_TIMEOUT_SEC || 900);
export const FUNCTION_DISK_MB = Number(process.env.REMOTION_FUNCTION_DISK_MB || 2048);

/**
 * framesPerLambda tuning.
 *
 * Remotion needs 1 orchestrator + N frame Lambdas.
 * This AWS account is capped at ConcurrentExecutions=10 — keep N ≤ 8.
 *
 * Override with REMOTION_FRAMES_PER_LAMBDA for a fixed chunk size
 * (still clamped by timeout-safe + account budget in planLambdaParallelism).
 */
export const FRAMES_PER_LAMBDA = Number(process.env.REMOTION_FRAMES_PER_LAMBDA || 0);

/**
 * Target parallel frame Lambdas (≤ account limit − 2).
 * Default 8 uses the full safe budget so ~26k-frame jobs get ~3k frames/chunk
 * instead of 4× ~6.5k chunks that exceed the 900s timeout.
 */
export const TARGET_FRAME_LAMBDAS = Math.max(
  1,
  Number(process.env.REMOTION_MAX_CONCURRENCY || 8),
);

/**
 * AWS account concurrent Lambda limit (reserve 1 for orchestrator).
 * Default 10 matches this account's AWS ConcurrentExecutions cap.
 * @see https://www.remotion.dev/docs/lambda/troubleshooting/rate-limit
 */
export const ACCOUNT_CONCURRENCY_LIMIT = Math.max(
  2,
  Number(process.env.REMOTION_ACCOUNT_CONCURRENCY_LIMIT || 10),
);

export function suggestedFramesPerLambda(durationSec: number, fps: number): number {
  const plan = planLambdaParallelism({
    durationSec,
    fps,
    accountConcurrencyLimit: ACCOUNT_CONCURRENCY_LIMIT,
    targetFrameLambdas: TARGET_FRAME_LAMBDAS,
    timeoutSec: FUNCTION_TIMEOUT_SEC,
    memoryMb: FUNCTION_MEMORY_MB,
    fixedFramesPerLambda: FRAMES_PER_LAMBDA > 0 ? FRAMES_PER_LAMBDA : undefined,
    concurrencyPerLambda: Number(process.env.REMOTION_CONCURRENCY_PER_LAMBDA || 2),
  });
  return plan.framesPerLambda;
}
