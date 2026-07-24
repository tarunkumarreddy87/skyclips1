/**
 * Isolation bench suite (wall time / fps / sec-per-frame).
 *
 * Usage (from packages/remotion-renderer):
 *   pnpm exec tsx scripts/isolate-ab-bench.ts --isolate=captions --frames=400
 *   pnpm exec tsx scripts/isolate-ab-bench.ts --isolate=transitions --frames=400
 *   pnpm exec tsx scripts/isolate-ab-bench.ts --isolate=animations --frames=400
 *
 * Baseline reference from theme-grade A/B filter-OFF: 6.657 fps / 0.1502 s/frame.
 * Each run also includes a same-session control for fair delta.
 */
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { TimelineCompositionProps } from "../src/lib/types";

/** Prior filter-OFF result — report against this as well as same-session control. */
const PRIOR_BASELINE = {
  framesPerSecWall: 6.657,
  secPerFrame: 0.1502,
  elapsedSec: 60.09,
  frames: 400,
};

type IsolateKind = "captions" | "transitions" | "animations" | "parallax";

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.slice(name.length + 3));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function argStr(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function applyIsolate(
  base: TimelineCompositionProps,
  isolate: IsolateKind,
  enabledCost: boolean,
): TimelineCompositionProps {
  // enabledCost=true → feature ON (control / expensive path)
  // enabledCost=false → feature OFF (isolation / cheap path)
  const props: TimelineCompositionProps = {
    ...base,
    muteAudio: true,
    disableThemeGrade: true,
    disableCaptions: isolate === "captions" ? !enabledCost : false,
    disableTransitions: isolate === "transitions" ? !enabledCost : false,
    disableAnimations: isolate === "animations" ? !enabledCost : false,
    disableParallax: isolate === "parallax" ? !enabledCost : false,
  };
  return props;
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const isolate = argStr("isolate", "captions") as IsolateKind;
  const requestedFrames = Math.max(1, argNum("frames", 400));
  const frameStart = Math.max(0, argNum("frame-start", 0));
  const concurrency = Math.max(1, argNum("concurrency", 1));
  const chrome =
    process.env.REMOTION_BROWSER_EXECUTABLE ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

  const allowed: IsolateKind[] = ["captions", "transitions", "animations", "parallax"];
  if (!allowed.includes(isolate)) {
    throw new Error(`--isolate must be one of ${allowed.join(", ")}`);
  }

  const baseProps = JSON.parse(
    fs.readFileSync(path.join(root, "out/theme-grade-ab-off.props.json"), "utf-8"),
  ) as TimelineCompositionProps;

  const outDir = path.join(root, "out", `isolate-${isolate}`);
  fs.mkdirSync(outDir, { recursive: true });

  console.log("Bundling…");
  const bundleStart = Date.now();
  const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts") });
  console.log(`Bundled in ${((Date.now() - bundleStart) / 1000).toFixed(1)}s`);

  const controlProps = applyIsolate(baseProps, isolate, true);
  const probe = await selectComposition({
    serveUrl,
    id: "TimelineComposition",
    inputProps: controlProps as unknown as Record<string, unknown>,
  });
  const frames = Math.min(requestedFrames, Math.max(1, probe.durationInFrames - frameStart));
  const lastFrame = frameStart + frames - 1;

  console.log(
    JSON.stringify(
      {
        isolate,
        requestedFrames,
        frameStart,
        frameRange: [frameStart, lastFrame],
        compositionDurationInFrames: probe.durationInFrames,
        framesRendered: frames,
        concurrency,
        captions: baseProps.manifest.tracks.captions?.length ?? 0,
        transitions: baseProps.manifest.transitions?.length ?? 0,
        priorBaselineFps: PRIOR_BASELINE.framesPerSecWall,
      },
      null,
      2,
    ),
  );

  const results: Array<Record<string, unknown>> = [];

  for (const [label, enabledCost] of [
    [`${isolate}-ON`, true],
    [`${isolate}-OFF`, false],
  ] as const) {
    const props = applyIsolate(baseProps, isolate, enabledCost);
    const composition = await selectComposition({
      serveUrl,
      id: "TimelineComposition",
      inputProps: props as unknown as Record<string, unknown>,
    });
    const outputLocation = path.join(outDir, `${label}.mp4`);
    if (fs.existsSync(outputLocation)) fs.unlinkSync(outputLocation);

    console.log(`\n=== ${label} frames=${frameStart}-${lastFrame} ===`);
    console.log(JSON.stringify({
      disableCaptions: props.disableCaptions,
      disableTransitions: props.disableTransitions,
      disableAnimations: props.disableAnimations,
      disableParallax: props.disableParallax,
    }));
    const t0 = Date.now();
    let lastPct = -1;
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation,
      inputProps: props as unknown as Record<string, unknown>,
      browserExecutable: chrome,
      concurrency,
      frameRange: [frameStart, lastFrame],
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 100);
        if (pct !== lastPct && pct % 5 === 0) {
          lastPct = pct;
          const elapsed = (Date.now() - t0) / 1000;
          const doneFrames = Math.max(1, Math.round(progress * frames));
          const fps = doneFrames / Math.max(0.001, elapsed);
          console.log(`  ${pct}%  elapsed=${elapsed.toFixed(1)}s  ~${fps.toFixed(2)} fps (wall)`);
        }
      },
    });
    const elapsedSec = (Date.now() - t0) / 1000;
    const row = {
      label,
      featureEnabled: enabledCost,
      frames,
      concurrency,
      elapsedSec: Number(elapsedSec.toFixed(2)),
      framesPerSecWall: Number((frames / elapsedSec).toFixed(3)),
      secPerFrame: Number((elapsedSec / frames).toFixed(4)),
      outputLocation,
    };
    results.push(row);
    console.log(JSON.stringify(row, null, 2));
  }

  const on = results.find((r) => r.label === `${isolate}-ON`)!;
  const off = results.find((r) => r.label === `${isolate}-OFF`)!;
  const onSec = on.elapsedSec as number;
  const offSec = off.elapsedSec as number;
  const onFps = on.framesPerSecWall as number;
  const offFps = off.framesPerSecWall as number;
  const deltaSec = onSec - offSec;
  const pctSlowerVsOff = offSec > 0 ? (deltaSec / offSec) * 100 : 0;
  const fpsGainVsPrior =
    ((offFps - PRIOR_BASELINE.framesPerSecWall) / PRIOR_BASELINE.framesPerSecWall) * 100;
  const costShareOfBaseline =
    PRIOR_BASELINE.secPerFrame > 0
      ? ((on.secPerFrame as number) - (off.secPerFrame as number)) / PRIOR_BASELINE.secPerFrame
      : 0;

  const large = Math.abs(pctSlowerVsOff) >= 8 || Math.abs(costShareOfBaseline) >= 0.08;
  const summary = {
    isolate,
    frames,
    concurrency,
    priorBaselineFps: PRIOR_BASELINE.framesPerSecWall,
    priorBaselineSecPerFrame: PRIOR_BASELINE.secPerFrame,
    featureOnSec: onSec,
    featureOffSec: offSec,
    featureOnFps: onFps,
    featureOffFps: offFps,
    sameSessionControlFps: onFps,
    deltaSec: Number(deltaSec.toFixed(2)),
    featureOnSlowerPct: Number(pctSlowerVsOff.toFixed(1)),
    fpsGainVsPriorBaselinePct: Number(fpsGainVsPrior.toFixed(1)),
    approxCostShareOfPriorBaseline: Number((costShareOfBaseline * 100).toFixed(1)),
    stopEarly: large,
    verdict: !large
      ? `NO meaningful delta for ${isolate} — continue isolation list`
      : `LARGE delta for ${isolate} — priority fix candidate (stop early)`,
  };

  const summaryPath = path.join(outDir, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify({ summary, results, priorBaseline: PRIOR_BASELINE }, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${summaryPath}`);
  if (large) {
    console.log("\n*** STOP EARLY: large cost attributed to this isolate ***");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
