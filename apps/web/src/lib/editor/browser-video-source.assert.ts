import assert from "node:assert/strict";
import { resolveBrowserSrc } from "./build-timeline-manifest";
import type { Asset } from "./types";

const asset: Asset = {id: "video", sourceType: "local", mediaType: "video", label: "Video", url: "https://example.com/clip.mp4", thumbnailUrl: "https://example.com/poster.jpg"};
assert.deepEqual(resolveBrowserSrc(asset), {src: asset.url});
assert.deepEqual(resolveBrowserSrc({...asset, metadata: {proxyUrl: "https://example.com/proxy.mp4"}}), {src: "https://example.com/proxy.mp4"});
assert.equal(resolveBrowserSrc({...asset, url: ""}).forceImage, true);
assert.equal(resolveBrowserSrc({...asset, mediaType: "image"}).forceImage, undefined);
console.log("PASS: video originals play while proxies are unavailable");
