import assert from "node:assert/strict";
import {clearMediaImageInflight, prefetchMediaImage} from "./media-request-cache";

async function main() {
  let requests = 0;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
  Object.defineProperty(globalThis, "window", {value: {}, configurable: true});
  Object.defineProperty(globalThis, "Image", {value: class {
    onload?: () => void;
    set src(_: string) { requests++; queueMicrotask(() => this.onload?.()); }
  }, configurable: true});
  try {
    await Promise.all([prefetchMediaImage("poster.jpg"), prefetchMediaImage("poster.jpg")]);
    await prefetchMediaImage("poster.jpg");
    assert.equal(requests, 1, "loaded thumbnails must not be requested again on rerender");
    clearMediaImageInflight();
    await prefetchMediaImage("poster.jpg");
    assert.equal(requests, 2, "explicit cache reset must permit reload");
    console.log("PASS: thumbnail preload requests are reused");
  } finally {
    clearMediaImageInflight();
    for (const [key, descriptor] of [["window", previousWindow], ["Image", previousImage]] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}
void main();
