import "./three-scene.test.js";
import "./press-audio.test.js";
import test from "node:test";
import assert from "node:assert/strict";
import type { TimelineManifestV1, MotionScene, MotionSceneLayer, EditorialARollTemplate } from "@hanuman/shared-types";
import { renderGraphicsFrame, evaluateMediaFrame, timelineDurationSec, applyKeyframes, evaluateAnimation, renderTemplateFrame, evaluateTemplateMediaSlot, renderMotionScene, sampleSceneLayer, templateCapabilities, evaluateClipEffects, timelineAudioCues } from "./index.js";

function fixture(): TimelineManifestV1 {
  return {
    version: "1", metadata: { project_id: "test", run_id: "run", format_mode: "documentary", resolution: { width: 1920, height: 1080 }, fps: 30, duration_sec: 10 },
    tracks: { audio: [], captions: [{ id: "caption", section_id: "scene", text: "New evidence emerges", start_sec: 1, duration_sec: 3,
      words: [{ text: "New", start_sec: 1, duration_sec: 1 }, { text: "evidence", start_sec: 2, duration_sec: 1 }, { text: "emerges", start_sec: 3, duration_sec: 1 }] }],
      video: [{ id: "left", scene_id: "a", type: "video", src: "a.mp4", start_sec: 0, duration_sec: 5 },
        { id: "right", scene_id: "b", type: "video", src: "b.mp4", start_sec: 5, duration_sec: 5, source_start_sec: 2 }] },
    transitions: [{ id: "transition", after_clip_id: "left", type: "fade", duration_sec: 1 }],
    graphics: [{ id: "photo", type: "frame", start_sec: 1, duration_sec: 5, src: "https://example.com/photo.jpg", transform: { x: 70, y: 45 },
      keyframes: [{ time_sec: 0, x: 70 }, { time_sec: 2, x: 25, scale: 0.7 }] }],
    settings: { caption_style: "clean_highlight", captions_enabled: true },
  };
}

test("non-sequential seeks reproduce the same graphics and do not mutate the manifest", () => {
  const manifest = fixture(); const snapshot = JSON.stringify(manifest);
  const first = renderGraphicsFrame(manifest, 2.25);
  renderGraphicsFrame(manifest, 5.9); renderGraphicsFrame(manifest, 0); renderGraphicsFrame(manifest, 3.7);
  assert.equal(renderGraphicsFrame(manifest, 2.25), first);
  assert.equal(JSON.stringify(manifest), snapshot);
  assert.match(first, /data-object-id="photo"/);
  assert.match(first, /data-object-id="caption"/);
});

test("caption and object windows are half open, with caption enable affecting only captions", () => {
  const manifest = fixture();
  assert.doesNotMatch(renderGraphicsFrame(manifest, 0.999), /data-object-id="caption"/);
  assert.match(renderGraphicsFrame(manifest, 1.2), /data-object-id="caption"/);
  assert.doesNotMatch(renderGraphicsFrame(manifest, 4), /data-object-id="caption"/);
  manifest.settings!.captions_enabled = false;
  const frame = renderGraphicsFrame(manifest, 2);
  assert.doesNotMatch(frame, /data-object-id="caption"/);
  assert.match(frame, /data-object-id="photo"/);
  assert.doesNotMatch(renderGraphicsFrame(manifest, 6), /data-object-id="photo"/);
});

test("a transition holds the incoming source handle without compressing timeline duration", () => {
  const manifest = fixture();
  const during = evaluateMediaFrame(manifest, 4.5);
  assert.equal(during.length, 2);
  assert.equal(during[1]!.held, true);
  assert.equal(during[1]!.sourceTimeSec, 2);
  assert.equal(during[0]!.transition.opacity, 1);
  assert.equal(during[1]!.transition.opacity, 0.5);
  const boundary = evaluateMediaFrame(manifest, 5);
  assert.equal(boundary.length, 1);
  assert.equal(boundary[0]!.clip.id, "right");
  assert.equal(boundary[0]!.held, false);
  assert.equal(boundary[0]!.sourceTimeSec, 2);
  assert.equal(timelineDurationSec(manifest), 10);
});

test("sparse keyframe channels keep their own values and reach the final authored composition", () => {
  const base = evaluateAnimation({ x: 50, y: 60 }, undefined, 2, 5);
  const keys = [{ time_sec: 0, x: 80 }, { time_sec: 1, y: 20 }, { time_sec: 2, x: 25, scale: 0.6 }];
  const end = applyKeyframes(base, keys, 2);
  assert.equal(end.x, 25); assert.equal(end.y, 20); assert.equal(end.scaleX, 0.6);
  assert.equal(applyKeyframes(base, keys, 0).y, 60);
});

test("SVG escapes user copy and blocks active image URLs", () => {
  const manifest = fixture();
  manifest.tracks.captions[0]!.text = '<script>alert("x")</script>';
  manifest.tracks.captions[0]!.words = undefined;
  manifest.graphics![0]!.src = "javascript:alert(1)";
  const frame = renderGraphicsFrame(manifest, 2);
  assert.doesNotMatch(frame, /<script|href="javascript:/);
  assert.match(frame, /&lt;script&gt;/);
});

test("export can embed a frame asset through the shared resolver", () => {
  const manifest = fixture();
  manifest.graphics![0]!.src = "projects/a/photo.png";
  const svg = renderGraphicsFrame(manifest, 2, { resolveAsset: () => "data:image/png;base64,AAAA" });
  assert.match(svg, /href="data:image\/png;base64,AAAA"/);
  assert.doesNotMatch(svg, /projects\/a\/photo.png/);
});

test("changing export raster resolution preserves graphic geometry and typography", () => {
  const manifest = fixture();
  const full = renderGraphicsFrame(manifest, 2);
  const proxy = renderGraphicsFrame(manifest, 2, { width: 320, height: 180 });
  assert.equal(proxy.replace('width="320" height="180"', 'width="1920" height="1080"'), full);
});

test("existing Hindi and Telugu caption scripts select bundled script fonts", () => {
  const manifest = fixture();
  manifest.tracks.captions[0]!.text = "भारत తెలుగు";
  manifest.tracks.captions[0]!.words = undefined;
  const svg = renderGraphicsFrame(manifest, 2);
  assert.match(svg, /font-family="Noto Sans Devanagari"/);
  assert.match(svg, /font-family="Noto Sans Telugu"/);
});

function sceneFixture(): MotionScene {
  return { version: 1, title: "Scene", durationMs: 4000, background: "#101010", audio: [], layers: [
    { id: "heading", kind: "text", x: 50, y: 25, width: 70, height: 20, text: "Premium insight", color: "#ffffff", fontSize: 100,
      fontWeight: 700, fontFamily: "sans", align: "center", radius: 0, strokeWidth: 0, strokeColor: "#000000", shadow: 0,
      startMs: 500, endMs: 3000, easing: "linear", keyframes: [{ timeMs: 500, x: 10, opacity: 0, reveal: 0 }, { timeMs: 1000, opacity: 1 }, { timeMs: 2000, x: 70, reveal: 1 }] },
  ] };
}

test("generated scene channels and boundary visibility survive arbitrary seeks", () => {
  const scene = sceneFixture(); const layer = scene.layers[0]!; const snapshot = JSON.stringify(scene);
  assert.equal(sampleSceneLayer(layer, 1250, "x", layer.x), 40);
  assert.equal(sampleSceneLayer(layer, 1250, "opacity", 1), 1);
  const frame = renderMotionScene(scene, 1250, "scene");
  renderMotionScene(scene, 2700, "scene");
  assert.equal(renderMotionScene(scene, 1250, "scene"), frame);
  assert.doesNotMatch(renderMotionScene(scene, 499, "scene"), /data-motion-layer/);
  assert.match(renderMotionScene(scene, 500, "scene"), /data-motion-layer="heading"/);
  assert.doesNotMatch(renderMotionScene(scene, 3000, "scene"), /data-motion-layer/);
  assert.equal(JSON.stringify(scene), snapshot);
});

test("generated scene images embed resolved assets without executing user markup", () => {
  const scene = sceneFixture();
  scene.layers.push({ ...scene.layers[0]!, id: "image", kind: "image", src: "projects/asset.png" });
  scene.layers[0]!.text = '<script src="evil">';
  const svg = renderMotionScene(scene, 1250, "scene", 1920, 1080, { resolveAsset: () => "data:image/png;base64,AAAA" });
  assert.match(svg, /href="data:image\/png;base64,AAAA"/);
  assert.doesNotMatch(svg, /<script/); assert.match(svg, /&lt;script/);
  scene.layers[1]!.src = "javascript:alert(1)";
  assert.doesNotMatch(renderMotionScene(scene, 1250, "scene"), /javascript:/);
});

test("documentary layers keep persisted IDs, content edits, hidden state and media-slot geometry", () => {
  const template: EditorialARollTemplate = { id: "doc-callout", title: "Document evidence", subtitle: "Primary source", documentary_layout: "profile",
    layer_edits: { title: { text: "Edited headline", color: "#e0574f", x: 50 }, subtitle: { hidden: true }, "media-subject": { x: 40, y: -20, scaleX: 0.8 }, "object-3": { x: 10, scaleY: 1.2 } } };
  const snapshot = JSON.stringify(template);
  const svg = renderTemplateFrame(template, 2, 6);
  assert.match(svg, /data-layer-id="title"/); assert.match(svg, /Edited headline/);
  assert.doesNotMatch(svg, /data-layer-id="subtitle"/); assert.match(svg, /data-layer-id="media-background"/);
  const slot = evaluateTemplateMediaSlot(template, 2);
  assert.deepEqual([slot.x, slot.y, slot.width, slot.height, slot.offsetX, slot.offsetY, slot.scaleX, slot.scaleY], [1120, 270, 630, 580, 50, -20, 0.8, 1.2]);
  assert.equal(slot.grayscale, true); assert.equal(slot.hidden, false);
  assert.equal(evaluateTemplateMediaSlot(template, 2, false).hidden, true);
  assert.equal(evaluateTemplateMediaSlot({ ...template, documentary_layout: "title" }, 2).hidden, true);
  assert.equal(JSON.stringify(template), snapshot);
});

test("data templates preserve negative values, stable bar edit IDs and deterministic counters", () => {
  const template: EditorialARollTemplate = { id: "vertical-bar-chart", title: "Net growth", values: [{ label: "Before", value: -10 }, { label: "After", value: 25 }],
    counter: { from: 0, to: 125, format: "number" }, layer_edits: { "object-4": { hidden: true } } };
  const svg = renderTemplateFrame(template, 2, 4);
  assert.doesNotMatch(svg, /data-layer-id="object-4"/); assert.match(svg, /data-layer-id="object-5"/);
  assert.match(svg, /-10/); assert.match(svg, />63<\/text>/);
  assert.equal(svg, renderTemplateFrame(template, 2, 4));
  const foreground = renderTemplateFrame(template, 2, 4, { phase: "foreground" });
  assert.doesNotMatch(foreground, /<rect width="1920" height="1080"/);
});

test("uploaded JavaScript templates require isolated HTML capture and cannot silently fall back", () => {
  const template: EditorialARollTemplate = { id: "editorial-title", title: "Safe title", html_template: { id: "upload", profileId: "profile", name: "Uploaded",
    description: "", tags: [], html: '<img src=x onerror="alert(1)">', css: "body{}", js: "throw new Error('execute')", durationSec: 4, assets: [], aiEnabled: true } };
  assert.equal(templateCapabilities(template).exact, true);
  assert.throws(() => renderTemplateFrame(template, 2, 4), /HTML\/GSAP renderer/);
});

test("all retained motion overlay types render their authored data", () => {
  const manifest = fixture(); manifest.tracks.captions = []; manifest.graphics = [];
  manifest.overlays = [{ id: "scene", type: "generated_scene", start_sec: 0, duration_sec: 4, scene: sceneFixture() },
    { id: "chart", type: "vertical_bar_chart", start_sec: 0, duration_sec: 4, title: "Customer growth", slots: [{ label: "April", value: 12 }, { label: "May", value: 25 }] }];
  const svg = renderGraphicsFrame(manifest, 2);
  assert.match(svg, /Premium insight/); assert.match(svg, /Customer growth/); assert.match(svg, /April/); assert.match(svg, />25<\/text>/);
  manifest.overlays[1]!.animation = { in: { preset: "fade", duration_sec: 1 } };
  assert.match(renderGraphicsFrame(manifest, 0.5), /data-object-id="chart" opacity="0\.875"/);
});

test("clip visual effects sample a fixed timestamp independently from playback history", () => {
  const effects = { effectId: "handheld", effectStrength: 0.8, filterId: "cinema", strength: 1 };
  const first = evaluateClipEffects(effects, 2.4, 30);
  evaluateClipEffects(effects, 7.1, 30); evaluateClipEffects(effects, 0, 30);
  assert.deepEqual(evaluateClipEffects(effects, 2.4, 30), first);
  assert.match(first.filter, /contrast\(1.18\)/); assert.match(first.transform, /scale\(1.04\)/);
  assert.equal(evaluateClipEffects({ effectId: "scanlines" }, 1).overlay, "scanlines");
});

test("shared cue plan offsets scene clocks, preserves ambient audio and trims at scene boundaries", () => {
  const manifest = fixture(); manifest.transitions = [];
  manifest.overlays = [{ id: "generated", type: "generated_scene", start_sec: 2, duration_sec: 5, scene: { ...sceneFixture(), durationMs: 3000,
    audio: [{ sound: "ambient", startMs: 300, volume: 0.4 }, { sound: "tick", startMs: 2800, volume: 0.2 }, { sound: "impact", startMs: 3000, volume: 0.5 }] } }];
  const snapshot = JSON.stringify(manifest); const cues = timelineAudioCues(manifest);
  assert.deepEqual(cues.map(cue => [cue.file, cue.startSec, cue.durationSec, cue.gain]), [["motion-ambient.wav", 2.3, 2.7, 0.4], ["motion-tick.wav", 4.8, 0.2, 0.2]]);
  assert.equal(JSON.stringify(manifest), snapshot); assert.deepEqual(timelineAudioCues(manifest), cues);
});

test("automatic transition cues share visual handles and yield to authored SFX", () => {
  const manifest = fixture(); manifest.transitions![0]!.type = "wipeleft";
  const cue = timelineAudioCues(manifest).find(item => item.id.startsWith("transition:"))!;
  assert.equal(cue.startSec, 4.1); assert.equal(cue.file, "motion-whoosh.wav");
  manifest.tracks.music = [{ id: "manual", type: "music", src: "sfx.wav", mood: "sfx", start_sec: 4.3, duration_sec: 0.1 }];
  assert.equal(timelineAudioCues(manifest).some(item => item.id.startsWith("transition:")), false);
  manifest.tracks.music = []; manifest.transitions![0]!.sfx_muted = true;
  assert.equal(timelineAudioCues(manifest).some(item => item.id.startsWith("transition:")), false);
});

test("built-in template cues follow layer entry and uploaded cue plans remain bounded", () => {
  const manifest = fixture(); manifest.transitions = [];
  manifest.tracks.video[1]!.motion_template = { id: "editorial-data", title: "Growth", values: [{ label: "A", value: 1 }, { label: "B", value: 2 }, { label: "C", value: 3 }] };
  const cues = timelineAudioCues(manifest);
  assert.deepEqual(cues.map(item => item.startSec), [5.2, 5.55, 5.62, 5.74]);
  assert.deepEqual(cues.map(item => item.gain), [0.15, 0.12, 0.08, 0.08]);
});

test("trimmed HTML templates seek their SFX source and never replay cut-off cues", () => {
  const manifest = fixture(); manifest.transitions = [];
  const clip = manifest.tracks.video[1]!;
  clip.source_start_sec = 1;
  clip.motion_template = {id:"editorial-title",title:"Trimmed",html_template:{id:"press-cutout-v1",profileId:"test",name:"Press Cutout",description:"",tags:[],html:"builtin",css:"",js:"",durationSec:10,assets:[],aiEnabled:true,
    audioCues:[{at:.1,sound:"tick",gain:.2},{at:.5,sound:"impact",gain:.3},{at:2,sound:"whoosh",gain:.4}]}};
  const cues = timelineAudioCues(manifest);
  assert.equal(cues.length,2);
  assert.equal(cues[0]!.startSec,5); assert.equal(cues[0]!.sourceStartSec,.5);
  assert.equal(cues[0]!.durationSec,.7);
  assert.equal(cues[1]!.startSec,6); assert.equal(cues[1]!.sourceStartSec,undefined);
});
