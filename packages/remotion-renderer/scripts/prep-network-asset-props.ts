/**
 * Prep Lambda props with AWS S3 presigned HTTPS URLs (network fetch).
 * MinIO is down — production artifacts bucket is the network source of truth.
 *
 *   pnpm exec tsx scripts/prep-network-asset-props.ts
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { planLambdaParallelism } from "../src/lambda/parallelism";

const BUCKET = "hanuman-artifacts-623271127861";
const REGION = "us-east-1";
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "out");

function awsJson(args: string[]): unknown {
  const raw = execFileSync("aws", [...args, "--region", REGION, "--output", "json"], {
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

function listKeys(prefix: string, suffix: string): string[] {
  const data = awsJson([
    "s3api",
    "list-objects-v2",
    "--bucket",
    BUCKET,
    "--prefix",
    prefix,
  ]) as { Contents?: Array<{ Key?: string }> };
  return (data.Contents ?? [])
    .map((c) => c.Key)
    .filter((k): k is string => Boolean(k && k.endsWith(suffix)));
}

function presign(key: string, expiresSec = 12 * 3600): string {
  return execFileSync(
    "aws",
    [
      "s3",
      "presign",
      `s3://${BUCKET}/${key}`,
      "--expires-in",
      String(expiresSec),
      "--region",
      REGION,
    ],
    { encoding: "utf-8" },
  ).trim();
}

function hydrateSrcs(
  manifest: any,
  urlByBasename: Map<string, string>,
  fallbackUrls: string[],
  opts?: { clearBroll?: boolean; forceVideoTypeForMp4?: boolean },
) {
  let i = 0;
  const hydrateClip = (clip: any) => {
    const src = clip?.src;
    if (typeof src !== "string") return clip;
    if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("color:")) {
      return clip;
    }
    const base = src.split("/").pop() || "";
    let url = urlByBasename.get(base);
    if (!url) {
      // Never fall back an image-typed clip onto a video URL (breaks Remotion <Img>).
      if (clip.type === "image" && fallbackUrls.some((u) => /\.mp4(\?|$)/i.test(u))) {
        return clip;
      }
      url = fallbackUrls[i++ % Math.max(1, fallbackUrls.length)];
    }
    const next = { ...clip, src: url };
    if (opts?.forceVideoTypeForMp4 && url && /\.mp4(\?|$)/i.test(url)) {
      next.type = "video";
    }
    return next;
  };
  const tracks = { ...manifest.tracks };
  for (const name of ["video", "broll", "audio", "music"] as const) {
    if (Array.isArray(tracks[name])) {
      tracks[name] = tracks[name].map(hydrateClip);
    }
  }
  if (opts?.clearBroll) {
    tracks.broll = [];
  }
  return { ...manifest, tracks };
}

function writeProps(name: string, manifest: any, extra: Record<string, unknown> = {}) {
  const props = { manifest, muteAudio: true, disableThemeGrade: true, ...extra };
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify(props));
  const plan = planLambdaParallelism({
    durationSec: manifest.metadata.duration_sec,
    fps: manifest.metadata.fps,
    accountConcurrencyLimit: 10,
    targetFrameLambdas: 8,
    timeoutSec: 900,
    memoryMb: 3008,
    concurrencyPerLambda: 2,
  });
  const types: Record<string, number> = {};
  for (const c of manifest.tracks.video || []) {
    types[c.type] = (types[c.type] || 0) + 1;
  }
  console.log(
    JSON.stringify(
      {
        file,
        duration: manifest.metadata.duration_sec,
        frames: Math.round(manifest.metadata.duration_sec * manifest.metadata.fps),
        videoTypes: types,
        plan,
      },
      null,
      2,
    ),
  );
  return plan;
}

function main() {
  const jpgKeys = listKeys(
    "projects/4b58a06e-a56d-412c-a0c9-bc1ac37bd2ae/runs/5cfb304a-bb64-4464-b559-99796499dbe7/assets/",
    ".jpg",
  );
  const mp4Keys = listKeys(
    "projects/8d1510ae-24c3-4743-8f7e-da435d9372b9/runs/617ec24d-4de7-4e73-baf3-70784ed77372/assets/",
    ".mp4",
  );
  console.log(`Presigning ${jpgKeys.length} JPGs + ${mp4Keys.length} MP4s…`);
  const jpgUrls = jpgKeys.map((k) => presign(k));
  const mp4Urls = mp4Keys.map((k) => presign(k));
  const jpgByBase = new Map(jpgKeys.map((k, i) => [k.split("/").pop()!, jpgUrls[i]!]));
  const mp4ByBase = new Map(mp4Keys.map((k, i) => [k.split("/").pop()!, mp4Urls[i]!]));

  // 1) Indian Fighters stills — real S3 network fetch (pipeline JPGs).
  const ifManifest = JSON.parse(
    fs.readFileSync(path.join(OUT, "indian-fighters-manifest.json"), "utf-8"),
  );
  ifManifest.tracks.audio = [];
  ifManifest.tracks.music = [];
  const ifHydrated = hydrateSrcs(ifManifest, jpgByBase, jpgUrls);
  writeProps("indian-fighters-s3-stills.props.json", ifHydrated);

  // 2) WW2 documentary — real OffthreadVideo A-roll (Pexels MP4s on S3).
  // Clear b-roll: pipeline stored image-typed b-roll keys that don't exist as MP4s.
  const ww2 = JSON.parse(fs.readFileSync(path.join(OUT, "ww2-timeline.v1.json"), "utf-8"));
  ww2.tracks.audio = [];
  ww2.tracks.music = [];
  const ww2Hydrated = hydrateSrcs(ww2, mp4ByBase, mp4Urls, {
    clearBroll: true,
    forceVideoTypeForMp4: true,
  });
  writeProps("ww2-offthread-video.props.json", ww2Hydrated);
}

main();
