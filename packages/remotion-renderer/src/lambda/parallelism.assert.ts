/**
 * Smoke checks for Lambda parallelism planning (run with: pnpm exec tsx src/lambda/parallelism.assert.ts)
 */
import {
  MAX_SAFE_FRAMES_PER_LAMBDA,
  accountFrameLambdaBudget,
  planLambdaParallelism,
} from "./parallelism";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const longDoc = planLambdaParallelism({
  durationSec: 870, // ~26k frames @ 30fps
  fps: 30,
  accountConcurrencyLimit: 10,
  targetFrameLambdas: 8,
  timeoutSec: 900,
  memoryMb: 3008,
  concurrencyPerLambda: 2,
});

assert(accountFrameLambdaBudget(10) === 8, "budget should be 8");
assert(longDoc.expectedFrameLambdas <= 8, `lambdas ${longDoc.expectedFrameLambdas} > 8`);
assert(
  longDoc.framesPerLambda <= MAX_SAFE_FRAMES_PER_LAMBDA || longDoc.expectedFrameLambdas === 8,
  `framesPerLambda ${longDoc.framesPerLambda} too large without using full budget`,
);
assert(
  longDoc.framesPerLambda <= 3500,
  `framesPerLambda ${longDoc.framesPerLambda} still in timeout danger zone`,
);

const oldBug = planLambdaParallelism({
  durationSec: 870,
  fps: 30,
  accountConcurrencyLimit: 10,
  targetFrameLambdas: 4, // previous ECS default — must NOT yield ~6500-frame chunks
  timeoutSec: 900,
  memoryMb: 3008,
  concurrencyPerLambda: 1,
});
assert(
  oldBug.framesPerLambda <= MAX_SAFE_FRAMES_PER_LAMBDA || oldBug.expectedFrameLambdas >= 8,
  `regression: target=4 still oversized (${oldBug.framesPerLambda} fpl / ${oldBug.expectedFrameLambdas} lambdas)`,
);

console.log(
  JSON.stringify(
    {
      longDoc,
      oldBugTarget4: oldBug,
      ok: true,
    },
    null,
    2,
  ),
);
