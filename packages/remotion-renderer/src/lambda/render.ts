/**
 * Trigger a Remotion Lambda render and poll progress.
 *
 * Usage:
 *   pnpm lambda:render
 *   pnpm lambda:render -- --props=fixtures/phase1-proof.props.json
 *
 * Env:
 *   REMOTION_FUNCTION_NAME, REMOTION_SERVE_URL (from deploy)
 *   REMOTION_AWS_* credentials
 */

import fs from "node:fs";
import path from "node:path";
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
} from "./config";
import type { TimelineCompositionProps } from "../lib/types";

function loadProps(): TimelineCompositionProps {
  const propsArg = process.argv.find((a) => a.startsWith("--props="));
  const propsPath = propsArg
    ? propsArg.slice("--props=".length)
    : path.resolve(process.cwd(), "fixtures/phase1-proof.props.json");
  const raw = JSON.parse(fs.readFileSync(propsPath, "utf-8")) as TimelineCompositionProps;
  return raw;
}

async function resolveFunctionName(): Promise<string> {
  if (process.env.REMOTION_FUNCTION_NAME) {
    return process.env.REMOTION_FUNCTION_NAME;
  }
  const functions = await getFunctions({ region: LAMBDA_REGION, compatibleOnly: true });
  if (!functions.length) {
    throw new Error("No compatible Remotion Lambda function. Run: pnpm lambda:deploy");
  }
  return functions[0].functionName;
}

async function main() {
  const serveUrl = process.env.REMOTION_SERVE_URL;
  if (!serveUrl) {
    throw new Error("REMOTION_SERVE_URL is required (from pnpm lambda:deploy)");
  }

  const inputProps = loadProps();
  const durationSec = inputProps.manifest.metadata.duration_sec;
  const fps = inputProps.manifest.metadata.fps;
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

  const functionName = await resolveFunctionName();
  const totalFrames = Math.round(durationSec * fps);

  console.log(`Serve URL: ${serveUrl}`);
  console.log(`Function: ${functionName}`);
  console.log(`Composition: ${COMPOSITION_ID}`);
  console.log(
    `Duration: ${durationSec}s @ ${fps}fps → ${totalFrames} frames; framesPerLambda=${plan.framesPerLambda} (~${plan.expectedFrameLambdas} lambdas); concurrencyPerLambda=${plan.concurrencyPerLambda ?? 1}`,
  );

  const { renderId, bucketName } = await renderMediaOnLambda({
    region: LAMBDA_REGION,
    functionName,
    serveUrl,
    composition: COMPOSITION_ID,
    inputProps: inputProps as unknown as Record<string, unknown>,
    codec: "h264",
    imageFormat: "jpeg",
    maxRetries: 1,
    framesPerLambda: plan.framesPerLambda,
    ...(plan.concurrencyPerLambda ? { concurrencyPerLambda: plan.concurrencyPerLambda } : {}),
    privacy: "private",
    downloadBehavior: { type: "play-in-browser" },
  });

  console.log(`Render started: renderId=${renderId} bucket=${bucketName}`);
  fs.writeFileSync(
    path.resolve(process.cwd(), "out/last-lambda-render.json"),
    JSON.stringify(
      {
        renderId,
        bucketName,
        functionName,
        plan,
        totalFrames,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const progress = await getRenderProgress({
      renderId,
      bucketName,
      functionName,
      region: LAMBDA_REGION,
    });

    const pct = Math.round((progress.overallProgress ?? 0) * 100);
    console.log(
      `Progress ${pct}%  done=${progress.done}  fatal=${progress.fatalErrorEncountered}  costs=$${progress.costs?.accruedSoFar?.toFixed?.(4) ?? progress.costs?.accruedSoFar ?? "?"}`,
    );

    if (progress.fatalErrorEncountered) {
      console.error(progress.errors);
      process.exit(1);
    }
    if (progress.done) {
      console.log(`Output: ${progress.outputFile}`);
      console.log(`Estimated cost: $${progress.costs?.accruedSoFar ?? "?"}`);
      const donePath = path.resolve(process.cwd(), "out/last-lambda-render.json");
      const prev = JSON.parse(fs.readFileSync(donePath, "utf-8"));
      fs.writeFileSync(
        donePath,
        JSON.stringify(
          {
            ...prev,
            doneAt: new Date().toISOString(),
            outputFile: progress.outputFile,
            costs: progress.costs,
            timeToFinish: progress.timeToFinish,
            chunks: progress.chunks,
          },
          null,
          2,
        ),
      );
      process.exit(0);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
