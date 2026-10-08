import assert from "node:assert/strict";
import { resizeGeometry } from "./resize-geometry";
const base = { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, zIndex: 0 };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.00001, `${a} != ${b}`);
const east = resizeGeometry(base, "e", 100, 0, 200, 100, 1000, 500, false);
close(east.scaleX, 1.5); close(east.x, 55); close(east.scaleY, 1);
close(east.x * 10 - 200 * east.scaleX / 2, 400); // west edge stays fixed
const corner = resizeGeometry(base, "se", 100, 50, 200, 100, 1000, 500, true);
close(corner.scaleX, 1.5); close(corner.scaleY, 1.5); close(corner.y, 55);
const rotated = resizeGeometry({ ...base, rotation: 90 }, "e", 0, 100, 200, 100, 1000, 500, false);
close(rotated.scaleX, 1.5); close(rotated.x, 50); close(rotated.y, 60);
const flipped = resizeGeometry({ ...base, scaleX: -1 }, "e", -100, 0, 200, 100, 1000, 500, false);
close(flipped.scaleX, -1.5); close(flipped.x, 45);
const zoomed = resizeGeometry(base, "se", 50, 25, 100, 50, 500, 250, true);
assert.deepEqual(zoomed, corner);
const bounded = resizeGeometry(base, "nw", 10000, 10000, 200, 100, 1000, 500, true, 0.35, 3.5);
close(bounded.scaleX, 0.35); close(bounded.scaleY, 0.35);
console.log("Resize geometry passed: anchored edges, proportional corners, rotation, flip, zoom and minimum scale");
