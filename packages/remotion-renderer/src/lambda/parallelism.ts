/**
 * Remotion Lambda parallelism planning.
 *
 * Never use a fixed low `concurrency` — it assigns huge frame ranges per Lambda
 * and causes timeouts on long videos. Always derive `framesPerLambda`
 * from duration, account quota, and timeout budget.
 *
 * Critical for new AWS accounts (ConcurrentExecutions=10): never spawn more
 * frame Lambdas than `accountLimit - 2` (1 orchestrator + 1 spare headroom).
 *
 * @see https://www.remotion.dev/docs/lambda/concurrency
 * @see https://www.remotion.dev/docs/lambda/troubleshooting/rate-limit
 */

/** Remotion hard cap on frame-renderer Lambdas per render. */
export const REMOTION_MAX_FRAME_LAMBDAS = 200;

/** Safe minimum chunk size (Remotion requires >= 4). */
export const MIN_FRAMES_PER_LAMBDA = 20;

/**
 * Prefer chunks in this band when account quota allows.
 * At ~6.7fps local / ~5fps real Lambda, 2800 frames ≈ 7–9 min — well under 900s.
 */
export const TARGET_FRAMES_PER_LAMBDA = 2800;

/**
 * Hard ceiling used when soft timeout math still leaves oversized chunks.
 * 3000 frames @ 5fps ≈ 600s; leaves ~300s margin under AWS 900s max.
 */
export const MAX_SAFE_FRAMES_PER_LAMBDA = 3000;

export interface LambdaParallelismPlan {
  framesPerLambda: number;
  expectedFrameLambdas: number;
  concurrencyPerLambda?: number;
}

export interface PlanLambdaParallelismInput {
  durationSec: number;
  fps: number;
  /** AWS account regional concurrent Lambda limit (often 10 new / 1000 mature). */
  accountConcurrencyLimit: number;
  /** Desired parallel frame Lambdas when quota allows. */
  targetFrameLambdas: number;
  timeoutSec: number;
  memoryMb: number;
  fixedFramesPerLambda?: number;
  /** Remotion `concurrencyPerLambda` — browser tabs per Lambda chunk. */
  concurrencyPerLambda?: number;
}

/** Remotion-recommended concurrency curve (30fps baseline). */
export function remotionTargetConcurrency(durationSec: number): number {
  const durationMin = durationSec / 60;
  if (durationMin <= 5) {
    return Math.round(50 + durationMin * 5);
  }
  if (durationMin <= 10) {
    return Math.round(75 + ((durationMin - 5) / 5) * 75);
  }
  if (durationMin <= 30) {
    return Math.round(150 + ((durationMin - 10) / 20) * 30);
  }
  return Math.min(REMOTION_MAX_FRAME_LAMBDAS, 180);
}

/**
 * Conservative export render throughput (frames/sec) per Lambda chunk.
 *
 * Local isolation (stills): ~6.7 fps @ concurrency=1.
 * Lambda E2E 2026-07-24 (3008MB/900s): IF stills ~3.6 fps; OffthreadVideo ~2.7 fps.
 * Keep estimates below local; when account-bound (8 chunks), long video docs may
 * still need a concurrency quota raise — see remotion-lambda README known-good.
 *
 * concurrencyPerLambda speedup uses a diminishing-returns curve (not linear).
 */
export function estimateChunkRenderFps(memoryMb: number, concurrencyPerLambda: number): number {
  const baseFps =
    memoryMb >= 8192 ? 10 :
    memoryMb >= 6144 ? 8 :
    memoryMb >= 3008 ? 5.5 :
    memoryMb >= 2048 ? 4 :
    3;
  const tabs = Math.max(1, concurrencyPerLambda);
  // Empirically: 2 tabs ≈ 1.5–1.7×, 3–4 tabs diminish further.
  const speedup = tabs <= 1 ? 1 : Math.min(2.4, 1 + (Math.sqrt(tabs) - 1) * 1.15);
  return baseFps * speedup;
}

/**
 * Frame-Lambda budget: leave room for the Remotion orchestrator Lambda
 * plus 1 spare slot so burst invokes don't hit Rate Exceeded at the account cap.
 */
export function accountFrameLambdaBudget(accountConcurrencyLimit: number): number {
  const accountLimit = Math.max(2, accountConcurrencyLimit);
  return Math.max(1, accountLimit - 2);
}

function clampToAccountBudget(
  totalFrames: number,
  framesPerLambda: number,
  accountFrameBudget: number,
): { framesPerLambda: number; expectedFrameLambdas: number } {
  let fpl = Math.max(MIN_FRAMES_PER_LAMBDA, framesPerLambda);
  let expected = Math.ceil(totalFrames / fpl);
  if (expected > accountFrameBudget) {
    fpl = Math.max(MIN_FRAMES_PER_LAMBDA, Math.ceil(totalFrames / accountFrameBudget));
    expected = Math.ceil(totalFrames / fpl);
  }
  if (expected > accountFrameBudget) {
    fpl = Math.max(MIN_FRAMES_PER_LAMBDA, Math.ceil(totalFrames / accountFrameBudget));
    expected = Math.min(accountFrameBudget, Math.ceil(totalFrames / fpl));
  }
  return { framesPerLambda: fpl, expectedFrameLambdas: expected };
}

export function planLambdaParallelism(input: PlanLambdaParallelismInput): LambdaParallelismPlan {
  const totalFrames = Math.max(1, Math.round(input.durationSec * input.fps));
  const tabsPerLambda = Math.max(1, input.concurrencyPerLambda ?? 1);
  const accountFrameBudget = accountFrameLambdaBudget(input.accountConcurrencyLimit);
  const concurrencyOut = tabsPerLambda > 1 ? tabsPerLambda : undefined;

  if (input.fixedFramesPerLambda && input.fixedFramesPerLambda > 0) {
    // Even fixed overrides must respect timeout-safe + account ceilings.
    const renderFps = estimateChunkRenderFps(input.memoryMb, tabsPerLambda);
    const timeoutCap = Math.max(
      MIN_FRAMES_PER_LAMBDA,
      Math.floor(input.timeoutSec * renderFps * 0.5),
    );
    const capped = Math.min(
      input.fixedFramesPerLambda,
      MAX_SAFE_FRAMES_PER_LAMBDA,
      timeoutCap > 0 ? timeoutCap : MAX_SAFE_FRAMES_PER_LAMBDA,
    );
    return {
      ...clampToAccountBudget(totalFrames, capped, accountFrameBudget),
      concurrencyPerLambda: concurrencyOut,
    };
  }

  const renderFps = estimateChunkRenderFps(input.memoryMb, tabsPerLambda);
  // 50% timeout budget → comfortable margin under AWS 900s (cold start + fetch).
  const maxFramesForTimeout = Math.max(
    MIN_FRAMES_PER_LAMBDA,
    Math.floor(input.timeoutSec * renderFps * 0.5),
  );
  const safeCap = Math.min(MAX_SAFE_FRAMES_PER_LAMBDA, maxFramesForTimeout, TARGET_FRAMES_PER_LAMBDA);

  // Use as many frame Lambdas as quota allows (not a tiny fixed target like 4).
  const idealConcurrency = Math.min(
    remotionTargetConcurrency(input.durationSec),
    Math.max(1, input.targetFrameLambdas),
    accountFrameBudget,
    REMOTION_MAX_FRAME_LAMBDAS,
  );

  // Start from target band, then ensure we have enough Lambdas for the duration.
  let framesPerLambda = Math.min(
    safeCap,
    Math.max(MIN_FRAMES_PER_LAMBDA, Math.ceil(totalFrames / idealConcurrency)),
  );

  // If timeout-safe size needs more Lambdas, expand up to account budget.
  const lambdasForSafe = Math.ceil(totalFrames / Math.max(1, safeCap));
  if (lambdasForSafe <= accountFrameBudget) {
    framesPerLambda = Math.min(framesPerLambda, safeCap);
  } else {
    // Quota-bound: smallest chunk size we can afford (= largest parallel set).
    framesPerLambda = Math.max(
      MIN_FRAMES_PER_LAMBDA,
      Math.ceil(totalFrames / accountFrameBudget),
    );
  }

  const clamped = clampToAccountBudget(totalFrames, framesPerLambda, accountFrameBudget);

  return {
    ...clamped,
    concurrencyPerLambda: concurrencyOut,
  };
}
