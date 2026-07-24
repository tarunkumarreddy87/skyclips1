/**
 * Temporary isolation bench: theme CSS filter ON vs OFF.
 *
 * Bundles once, then renders the same frame range twice with identical
 * concurrency / codec — only `disableThemeGrade` differs.
 *
 * Usage (from packages/remotion-renderer):
 *   pnpm exec tsx scripts/theme-grade-ab-bench.ts
 *   pnpm exec tsx scripts/theme-grade-ab-bench.ts --frames=600 --concurrency=1
 */
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { TimelineCompositionProps } from "../src/lib/types";

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.slice(name.length + 3));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const requestedFrames = argNum("frames", 2000);
  const concurrency = argNum("concurrency", 1);
  const chrome =
    process.env.REMOTION_BROWSER_EXECUTABLE ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

  const onProps = JSON.parse(
    fs.readFileSync(path.join(root, "out/theme-grade-ab-on.props.json"), "utf-8"),
  ) as TimelineCompositionProps;
  const offProps = JSON.parse(
    fs.readFileSync(path.join(root, "out/theme-grade-ab-off.props.json"), "utf-8"),
  ) as TimelineCompositionProps;

  const outDir = path.join(root, "out/theme-grade-ab");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("Bundling…");
  const bundleStart = Date.now();
  const serveUrl = await bundle({
    entryPoint: path.join(root, "src/index.ts"),
  });
  console.log(`Bundled in ${((Date.now() - bundleStart) / 1000).toFixed(1)}s`);

  // Resolve real composition length (TransitionSeries compresses overlap).
  const probe = await selectComposition({
    serveUrl,
    id: "TimelineComposition",
    inputProps: { ...onProps, muteAudio: true } as unknown as Record<string, unknown>,
  });
  const frames = Math.min(requestedFrames, probe.durationInFrames);
  const lastFrame = frames - 1;

  console.log(
    JSON.stringify(
      {
        requestedFrames,
        compositionDurationInFrames: probe.durationInFrames,
        framesRendered: frames,
        concurrency,
        theme: onProps.manifest.settings?.theme_id,
        videos: onProps.manifest.tracks.video.length,
        captions: onProps.manifest.tracks.captions.length,
        note: "color: stand-ins for assets (MinIO down) — isolates CSS filter cost",
      },
      null,
      2,
    ),
  );

  const results: Array<Record<string, unknown>> = [];

  for (const [label, inputProps, disable] of [
    ["filter-ON", onProps, false],
    ["filter-OFF", offProps, true],
  ] as const) {
    const props: TimelineCompositionProps = {
      ...inputProps,
      disableThemeGrade: disable,
      muteAudio: true,
    };
    const composition = await selectComposition({
      serveUrl,
      id: "TimelineComposition",
      inputProps: props as unknown as Record<string, unknown>,
    });

    const outputLocation = path.join(outDir, `${label}.mp4`);
    if (fs.existsSync(outputLocation)) fs.unlinkSync(outputLocation);

    console.log(`\n=== ${label} (disableThemeGrade=${disable}) frames=0-${lastFrame} ===`);
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
      // Verbose-ish progress for per-run fps; full --log=verbose is enormous.
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 100);
        if (pct !== lastPct && pct % 5 === 0) {
          lastPct = pct;
          const elapsed = (Date.now() - t0) / 1000;
          const doneFrames = Math.max(1, Math.round(progress * frames));
          const fps = doneFrames / Math.max(0.001, elapsed);
          console.log(
            `  ${pct}%  elapsed=${elapsed.toFixed(1)}s  ~${fps.toFixed(2)} fps (wall)`,
          );
        }
      },
    });
    const elapsedSec = (Date.now() - t0) / 1000;
    const fps = frames / elapsedSec;
    const row = {
      label,
      disableThemeGrade: disable,
      frames,
      concurrency,
      elapsedSec: Number(elapsedSec.toFixed(2)),
      framesPerSecWall: Number(fps.toFixed(3)),
      secPerFrame: Number((elapsedSec / frames).toFixed(4)),
      outputLocation,
    };
    results.push(row);
    console.log(JSON.stringify(row, null, 2));
  }

  const on = results.find((r) => r.label === "filter-ON")!;
  const off = results.find((r) => r.label === "filter-OFF")!;
  const onSec = on.elapsedSec as number;
  const offSec = off.elapsedSec as number;
  const deltaSec = onSec - offSec;
  const pctSlower = offSec > 0 ? (deltaSec / offSec) * 100 : 0;
  const summary = {
    frames,
    concurrency,
    filterOnSec: onSec,
    filterOffSec: offSec,
    deltaSec: Number(deltaSec.toFixed(2)),
    filterOnSlowerPct: Number(pctSlower.toFixed(1)),
    filterOnFps: on.framesPerSecWall,
    filterOffFps: off.framesPerSecWall,
    verdict:
      Math.abs(pctSlower) < 8
        ? "NO meaningful delta — bottleneck elsewhere"
        : pctSlower >= 8
          ? "LARGE delta — theme grade CSS filter is a primary cost"
          : "filter OFF slower (unexpected) — re-run / check noise",
  };
  const summaryPath = path.join(outDir, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify({ summary, results }, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${summaryPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
