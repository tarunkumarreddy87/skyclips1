import fs from "node:fs";
import { planLambdaParallelism } from "../src/lambda/parallelism";

const m = JSON.parse(
  fs.readFileSync(new URL("../out/indian-fighters-manifest.json", import.meta.url), "utf-8"),
);
const files = [
  "static:isolate-fixtures/a.jpg",
  "static:isolate-fixtures/b.jpg",
  "static:isolate-fixtures/c.jpg",
];
const map = (arr: any[]) =>
  (arr || []).map((c: any, i: number) => {
    const o = { ...c };
    if (
      typeof o.src === "string" &&
      !o.src.startsWith("color:") &&
      !o.src.startsWith("http") &&
      !o.src.startsWith("static:")
    ) {
      o.src = files[i % 3];
      if (o.type === "video") o.type = "image";
    }
    return o;
  });
m.tracks.video = map(m.tracks.video);
m.tracks.broll = map(m.tracks.broll || []);
m.tracks.audio = [];
m.tracks.music = [];
const props = { manifest: m, muteAudio: true, disableThemeGrade: true };
fs.writeFileSync(
  new URL("../out/indian-fighters-lambda.props.json", import.meta.url),
  JSON.stringify(props),
);
const plan = planLambdaParallelism({
  durationSec: m.metadata.duration_sec,
  fps: m.metadata.fps,
  accountConcurrencyLimit: 10,
  targetFrameLambdas: 8,
  timeoutSec: 900,
  memoryMb: 3008,
  concurrencyPerLambda: 2,
});
console.log(
  JSON.stringify(
    {
      duration: m.metadata.duration_sec,
      frames: Math.round(m.metadata.duration_sec * m.metadata.fps),
      videos: m.tracks.video.length,
      plan,
    },
    null,
    2,
  ),
);
