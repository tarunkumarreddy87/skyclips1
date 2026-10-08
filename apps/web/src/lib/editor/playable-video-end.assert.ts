import assert from "node:assert/strict";
import {playableVideoEnd} from "./playable-video-end";
assert.equal(playableVideoEnd(10000,40000,0,16.64,30),26633.333333333332);
assert.equal(playableVideoEnd(10000,40000,5000,20,30),25000);
assert.equal(playableVideoEnd(10000,15000,0,20,30),15000);
assert.equal(playableVideoEnd(0,1000,0,Infinity,30),1000);
console.log("PASS: unavailable video tails are bounded without ripple edits");
