/**
 * Color stand-ins vs real photographic Img assets (decode / raster cost).
 * Same 400-frame window, concurrency=1, theme grade off.
 */
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { TimelineCompositionProps } from "../src/lib/types";

const PRIOR_BASELINE = { framesPerSecWall: 6.657, secPerFrame: 0.1502 };

async function main() {
  const root = path.resolve(__dirname, "..");
  const frames = 400;
  const concurrency = 1;
  const chrome =
    process.env.REMOTION_BROWSER_EXECUTABLE ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const outDir = path.join(root, "out/isolate-photos");
  fs.mkdirSync(outDir, { recursive: true });

  const colorProps = JSON.parse(
    fs.readFileSync(path.join(root, "out/theme-grade-ab-off.props.json"), "utf-8"),
  ) as TimelineCompositionProps;
  const photoProps = JSON.parse(
    fs.readFileSync(path.join(root, "out/isolate-photos.props.json"), "utf-8"),
  ) as TimelineCompositionProps;

  console.log("Bundling…");
  const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts") });

  const results: Array<Record<string, unknown>> = [];
  for (const [label, inputProps] of [
    ["color-standins", { ...colorProps, muteAudio: true, disableThemeGrade: true }],
    ["photo-assets", { ...photoProps, muteAudio: true, disableThemeGrade: true }],
  ] as const) {
    const props = inputProps as TimelineCompositionProps;
    const composition = await selectComposition({
      serveUrl,
      id: "TimelineComposition",
      inputProps: props as unknown as Record<string, unknown>,
    });
    const lastFrame = Math.min(frames, composition.durationInFrames) - 1;
    const n = lastFrame + 1;
    const outputLocation = path.join(outDir, `${label}.mp4`);
    if (fs.existsSync(outputLocation)) fs.unlinkSync(outputLocation);
    console.log(`\n=== ${label} frames=0-${lastFrame} ===`);
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
      frameRange: [0, lastFrame],
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 100);
        if (pct !== lastPct && pct % 5 === 0) {
          lastPct = pct;
          const elapsed = (Date.now() - t0) / 1000;
          console.log(
            `  ${pct}%  elapsed=${elapsed.toFixed(1)}s  ~${(Math.max(1, Math.round(progress * n)) / Math.max(0.001, elapsed)).toFixed(2)} fps`,
          );
        }
      },
    });
    const elapsedSec = (Date.now() - t0) / 1000;
    results.push({
      label,
      frames: n,
      concurrency,
      elapsedSec: Number(elapsedSec.toFixed(2)),
      framesPerSecWall: Number((n / elapsedSec).toFixed(3)),
      secPerFrame: Number((elapsedSec / n).toFixed(4)),
      outputLocation,
    });
    console.log(JSON.stringify(results[results.length - 1], null, 2));
  }

  const color = results.find((r) => r.label === "color-standins")!;
  const photo = results.find((r) => r.label === "photo-assets")!;
  const deltaSec = (photo.elapsedSec as number) - (color.elapsedSec as number);
  const pctSlower =
    ((photo.elapsedSec as number) - (color.elapsedSec as number)) /
    (color.elapsedSec as number) *
    100;
  const summary = {
    isolate: "photo-decode",
    frames,
    concurrency,
    priorBaselineFps: PRIOR_BASELINE.framesPerSecWall,
    colorFps: color.framesPerSecWall,
    photoFps: photo.framesPerSecWall,
    colorSec: color.elapsedSec,
    photoSec: photo.elapsedSec,
    deltaSec: Number(deltaSec.toFixed(2)),
    photoSlowerPct: Number(pctSlower.toFixed(1)),
    verdict:
      Math.abs(pctSlower) < 8
        ? "NO meaningful decode delta vs color stand-ins — baseline is Remotion/Chrome/encode overhead"
        : "LARGE decode delta — photographic Img/OffthreadVideo is a primary cost on real assets",
  };
  const summaryPath = path.join(outDir, "summary.json");
  fs.writeFileSync(
    summaryPath,
    JSON.stringify({ summary, results, priorBaseline: PRIOR_BASELINE }, null, 2),
  );
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${summaryPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
