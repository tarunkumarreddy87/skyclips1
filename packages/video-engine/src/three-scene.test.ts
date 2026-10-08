import test from "node:test";
import assert from "node:assert/strict";
import { createThreePreset, threeObjectPose, threeSceneSchema } from "@hanuman/shared-types";

test("Three scene rejects executable data, excess objects and invalid animation", () => {
  const scene = createThreePreset("orbit");
  assert.equal(threeSceneSchema.safeParse(scene).success, true);
  for (const invalid of [ { ...scene, script: "fetch('bad')" }, { ...scene, objects: Array(65).fill(scene.objects[0]) },
    { ...scene, camera: { position: [0, 0, 0] } }, { ...scene, objects: [ { ...scene.objects[0], scale: [1, -1, 1] } ] },
    { ...scene, objects: [ { ...scene.objects[0], keyframes: [{time_sec: 1}, {time_sec: 0}] } ] },
    { ...scene, objects: [ { ...scene.objects[0], spin: [Infinity, 0, 0] } ] },
    { ...scene, objects: [scene.objects[0], scene.objects[0]] },
  ]) assert.equal(threeSceneSchema.safeParse(invalid).success, false);
});

test("absolute animation can seek backwards and preserve trimmed/split source time", () => {
  const object = createThreePreset("bars").objects[2]!;
  const middle = threeObjectPose(object, 0.9);
  threeObjectPose(object, 1800);
  assert.deepEqual(threeObjectPose(object, 0.9), middle);
  assert.ok(middle.scale[1] > 0.01 && middle.scale[1] < 3.2);
  const spinning = createThreePreset("orbit").objects[0]!;
  assert.equal(threeObjectPose(spinning, 8.5).rotation[1], 1.7 + Number.EPSILON);
});
