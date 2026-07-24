/**
 * Local concurrency sweep for TimelineComposition (maps to concurrencyPerLambda).
 * Usage: pnpm exec tsx scripts/concurrency-sweep.ts
 */
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { TimelineCompositionProps } from "../src/lib/types";

async function main() {
  const root = path.resolve(__dirname, "..");
  const frames = 120;
  const lastFrame = frames - 1;
  const concurrencies = [1, 2, 3, 4];
  const chrome =
    process.env.REMOTION_BROWSER_EXECUTABLE ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const props = {
    ...(JSON.parse(
      fs.readFileSync(path.join(root, "out/theme-grade-ab-off.props.json"), "utf-8"),
    ) as TimelineCompositionProps),
    muteAudio: true,
    disableThemeGrade: true,
  };
  const outDir = path.join(root, "out/concurrency-bench");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("Bundling…");
  const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts") });
  const composition = await selectComposition({
    serveUrl,
    id: "TimelineComposition",
    inputProps: props as unknown as Record<string, unknown>,
  });

  const results: Array<Record<string, unknown>> = [];
  for (const concurrency of concurrencies) {
    const outputLocation = path.join(outDir, `c${concurrency}.mp4`);
    if (fs.existsSync(outputLocation)) fs.unlinkSync(outputLocation);
    console.log(`\n=== concurrency=${concurrency} frames=0-${lastFrame} ===`);
    const t0 = Date.now();
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation,
      inputProps: props as unknown as Record<string, unknown>,
      browserExecutable: chrome,
      concurrency,
      frameRange: [0, lastFrame],
    });
    const elapsedSec = (Date.now() - t0) / 1000;
    const row = {
      concurrency,
      frames,
      elapsedSec: Number(elapsedSec.toFixed(2)),
      framesPerSecWall: Number((frames / elapsedSec).toFixed(3)),
      secPerFrame: Number((elapsedSec / frames).toFixed(4)),
    };
    results.push(row);
    console.log(JSON.stringify(row));
  }

  const ranked = [...results].sort(
    (a, b) => (b.framesPerSecWall as number) - (a.framesPerSecWall as number),
  );
  const summary = {
    frames,
    results,
    bestConcurrency: ranked[0]?.concurrency,
    bestFps: ranked[0]?.framesPerSecWall,
    note: "Pick concurrencyPerLambda from bestConcurrency (diminishing returns past peak).",
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
