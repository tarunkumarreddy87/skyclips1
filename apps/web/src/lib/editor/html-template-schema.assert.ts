import assert from "node:assert/strict";
import { htmlTemplateSchema } from "./html-template-schema";

const template = {
  id: "press-cutout-v1", profileId: "channel", name: "Press Cutout", description: "", tags: [],
  html: "<main></main>", css: "", js: "", durationSec: 10, aiEnabled: true, assets: [],
  audioCues: ["paper", "impact", "marker", "whoosh", "pencil", "rise", "exit"].map(sound => ({ at: 1, sound: `press-${sound}`, gain: .3 })),
};
assert.equal(htmlTemplateSchema.safeParse(template).success, true);
assert.equal(htmlTemplateSchema.safeParse({ ...template, id: "10000000-0000-4000-8000-000000000001" }).success, true, "Existing upload IDs remain valid");
assert.equal(htmlTemplateSchema.safeParse({ ...template, id: "unknown-builtin" }).success, false);
assert.equal(htmlTemplateSchema.safeParse({ ...template, audioCues: [{ at: 1, sound: "../private", gain: .3 }] }).success, false, "Cue paths must stay in the bundled allowlist");
assert.equal(htmlTemplateSchema.safeParse({ ...template, audioCues: [{ at: 1, sound: "press-paper", gain: 1.2 }] }).success, false, "Reject unsafe cue levels");
console.log("HTML template sound/schema contract passed");
