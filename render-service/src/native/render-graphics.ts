/** Rasterize the same SVG scene used by browser preview at explicit timestamps. */
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { renderGraphicsFrame, renderTemplateFrame, evaluateTemplateMediaSlot, timelineAudioCues } from "@hanuman/video-engine";
import type { TimelineManifestV1 } from "@hanuman/shared-types";

interface Request {
  manifest: TimelineManifestV1;
  startFrame: number;
  frameCount: number;
  width: number;
  height: number;
  fps: number;
  assetPaths: Record<string, string>;
  outputDir: string;
  templateLocalSec?: number;
}

const request: Request = JSON.parse(await readFile(process.argv[2]!, "utf8"));
if (process.argv.includes("--audio-cues")) {
  await mkdir(request.outputDir, { recursive: true });
  await writeFile(path.join(request.outputDir, "audio-cues.json"), JSON.stringify(timelineAudioCues(request.manifest)));
  process.exit(0);
}
if (process.argv.includes("--template-background")) {
  const clip = request.manifest.tracks.video.find(item => item.motion_template);
  if (!clip?.motion_template) throw new Error("Template background request has no template");
  await mkdir(request.outputDir, { recursive: true });
  const hasMedia = !clip.src.startsWith("color:");
  const svg = renderTemplateFrame(clip.motion_template, request.templateLocalSec ?? 1.5, clip.duration_sec,
    { width: request.width, height: request.height, phase: "background", hasMedia });
  await writeFile(path.join(request.outputDir, "template-background.png"), new Resvg(svg).render().asPng());
  await writeFile(path.join(request.outputDir, "template-slot.json"), JSON.stringify(evaluateTemplateMediaSlot(clip.motion_template, request.templateLocalSec ?? 1.5, hasMedia)));
  process.exit(0);
}
const raw = process.argv.includes("--raw");
if (raw) process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  // FFmpeg may close its input after reaching the requested frame limit.
  // Its exit status and the encoded frame count are checked by the compositor.
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});
const assets: Record<string, string> = {};
for (const [source, local] of Object.entries(request.assetPaths)) {
  const ext = path.extname(local).toLowerCase();
  const mime = ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" } as Record<string, string>)[ext];
  if (mime) assets[source] = `data:${mime};base64,${(await readFile(local)).toString("base64")}`;
}
if (!raw) await mkdir(request.outputDir, { recursive: true });
const fonts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../packages/video-engine/fonts");
const fontNames = (await readdir(fonts)).filter((name) => name.endsWith(".ttf"));
const families = new Set<string>();
// Load just the fonts the whole section uses, including timed caption pages.
for (let frame = 0; frame < request.frameCount; frame++) {
  const svg = renderGraphicsFrame(request.manifest, (request.startFrame + frame) / request.fps,
    { width: request.width, height: request.height });
  for (const match of svg.matchAll(/font-family="([^"]+)"/g)) families.add(match[1]!.replace(/\s/g, "").toLowerCase());
}
families.add("lato");
const fontFiles = fontNames.filter((name) => families.has(name.split("-")[0]!.toLowerCase())).map((name) => path.join(fonts, name));
// Bounded cache benefits static holds without retaining an entire video in RAM.
const cache = new Map<string, Buffer>();
for (let frame = 0; frame < request.frameCount; frame++) {
  const svg = renderGraphicsFrame(request.manifest, (request.startFrame + frame) / request.fps, {
    width: request.width,
    height: request.height,
    resolveAsset: (source: string) => assets[source] ?? source,
  });
  let buffer = cache.get(svg);
  if (!buffer) {
    const renderer = new Resvg(svg, { font: { loadSystemFonts: false, fontFiles, defaultFontFamily: "Lato" } });
    const rendered = renderer.render();
    buffer = raw ? rendered.pixels : rendered.asPng();
    if (cache.size >= 4) cache.delete(cache.keys().next().value!);
    cache.set(svg, buffer);
  }
  if (raw) {
    if (!process.stdout.write(buffer)) await once(process.stdout, "drain");
  } else {
    await writeFile(path.join(request.outputDir, `frame-${String(frame).padStart(6, "0")}.png`), buffer);
  }
}
