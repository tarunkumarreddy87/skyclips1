const assert = {
  ok(condition: unknown, message = "Expected validation failure") {
    if (!condition) throw new Error(message);
  },
  deepEqual(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Unexpected validation issues");
  },
};
import fixture from "../fixtures/documentary-minimal.json";
import { inspectTimeline } from "./inspect";

assert.deepEqual(inspectTimeline(fixture), []);
for (const value of [null, {}, [], { ...fixture, tracks: null }]) {
  assert.ok(inspectTimeline(value).length, "Malformed manifest must yield issues, not throw");
}
const invalidDuration = structuredClone(fixture);
invalidDuration.tracks.video[0].duration_sec = -1;
assert.ok(inspectTimeline(invalidDuration).some((issue) => issue.path.includes("duration_sec")));
const duplicate = structuredClone(fixture);
duplicate.tracks.video.push({ ...duplicate.tracks.video[0] });
assert.ok(inspectTimeline(duplicate).some((issue) => issue.message.includes("duplicate")));
for (const duration of [NaN, Infinity, -Infinity]) {
  const invalid = structuredClone(fixture);
  invalid.metadata.duration_sec = duration;
  assert.ok(inspectTimeline(invalid).length, "Non-finite duration must be rejected");
}
const dangling = { ...fixture, transitions: [{ id: "dangling", after_clip_id: "missing", type: "fade", duration_sec: 0.5 }] };
assert.ok(inspectTimeline(dangling).some((issue) => issue.path.startsWith("/transitions")));
const editorial = structuredClone(fixture) as typeof fixture & { tracks: { video: Array<(typeof fixture.tracks.video)[number] & { motion_template?: unknown }> } };
editorial.tracks.video[0].motion_template = {
  id: "editorial-data", title: "A sourced trend", source_label: "Census Bureau",
  values: [{ label: "Start", value: 22 }, { label: "End", value: 45 }],
};
assert.deepEqual(inspectTimeline(editorial), []);
for (const id of ["vertical-bar-chart", "line-chart", "before-after-split", "news-highlight", "doc-callout", "highlight-quote", "product-launch-fullscreen"]) {
  editorial.tracks.video[0].motion_template = { id, title: "A full-frame scene" };
  assert.deepEqual(inspectTimeline(editorial), []);
}
editorial.tracks.video[0].motion_template = { id: "editorial-unknown", title: "Unknown" };
assert.ok(inspectTimeline(editorial).some(issue => issue.path.includes("motion_template")));
console.log("Timeline validation regressions passed");
