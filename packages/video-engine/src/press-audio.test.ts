import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { HtmlTemplate, TimelineManifestV1 } from "@hanuman/shared-types";
import { timelineAudioCues } from "./audio.js";

const audioCues: NonNullable<HtmlTemplate["audioCues"]> = [
  { at: .12, sound: "press-paper", gain: .4 }, { at: .45, sound: "press-impact", gain: .32 },
  { at: 1.25, sound: "press-marker", gain: .34 }, { at: 2, sound: "press-whoosh", gain: .34 },
  { at: 3.4, sound: "press-pencil", gain: .3 }, { at: 6, sound: "press-rise", gain: .24 },
  { at: 9.4, sound: "press-exit", gain: .3 },
];

function manifest(): TimelineManifestV1 {
  return {
    version: "1", metadata: { project_id: "press", run_id: "test", format_mode: "documentary", resolution: { width: 1920, height: 1080 }, fps: 30, duration_sec: 12 },
    tracks: { video: [{ id: "article", scene_id: "scene", type: "image", src: "color:#eee8dd", start_sec: 2, duration_sec: 10,
      motion_template: { id: "editorial-newspaper", title: "New evidence", html_template: {
        id: "press-cutout-v1", profileId: "built-in", name: "Press Cutout", description: "", tags: [], html: "<main></main>",
        css: "", js: "", durationSec: 10, assets: [], aiEnabled: true, audioCues,
      } } }], audio: [], captions: [] },
  };
}

test("press cues map to shipped stereo PCM with silent endpoints and safe headroom", () => {
  const cues = timelineAudioCues(manifest());
  assert.equal(cues.length, 7);
  for (const [index, cue] of cues.entries()) {
    assert.equal(cue.startSec, 2 + audioCues[index]!.at, "Sound follows the owning clip's timeline start");
    assert.equal(cue.gain, audioCues[index]!.gain, "Planner must apply no second global gain");
    const wav = readFileSync(new URL(`../../../apps/web/public/sfx/${cue.file}`, import.meta.url));
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.toString("ascii", 8, 12), "WAVE");
    assert.equal(wav.readUInt16LE(20), 1, "Uncompressed PCM");
    assert.equal(wav.readUInt16LE(22), 2, "Stereo");
    assert.equal(wav.readUInt32LE(24), 48000);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.ok(Math.abs((wav.length - 44) / (48000 * 4) - cue.durationSec) < 1 / 48000);
    let peak = 0; let squareSum = 0;
    for (let offset = 44; offset < wav.length; offset += 2) {
      const sample = wav.readInt16LE(offset) / 32768;
      peak = Math.max(peak, Math.abs(sample)); squareSum += sample ** 2;
    }
    assert.ok(peak > .4 && peak < .45, "Peaks should retain at least 7 dB of headroom");
    assert.ok(Math.sqrt(squareSum / ((wav.length - 44) / 2)) > .02, "Sound is present");
    assert.equal(wav.readInt32LE(44), 0, "Both first samples fade from zero");
    assert.equal(wav.readInt32LE(wav.length - 4), 0, "Both last samples fade to zero");
  }
});

test("shortening a press clip trims its last audible cue and excludes future accents", () => {
  const short = manifest(); short.tracks.video[0]!.duration_sec = 3.6;
  const cues = timelineAudioCues(short);
  assert.equal(cues.length, 5);
  assert.equal(cues.at(-1)!.file, "motion-press-pencil.wav");
  assert.ok(Math.abs(cues.at(-1)!.durationSec - .2) < 1e-9);
  assert.ok(cues.every(cue => cue.startSec + cue.durationSec <= 5.6));
});
