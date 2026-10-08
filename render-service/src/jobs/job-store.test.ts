import { strict as assert } from "node:assert";
import { test } from "node:test";
import { JobStore, jobStore } from "./job-store.js";
import { cancelRenderJob } from "./render-worker.js";
import type { StartRenderRequest } from "../types.js";
const input = { manifest: { metadata: { duration_sec: 1 }, tracks: { video: [] } }, projectId: "project", runId: "run", outputKey: "projects/project/runs/run/final.mp4", externalId: "project:run" } as unknown as StartRenderRequest;
test("native idempotency reuses live/completed jobs and replaces failed/cancelled jobs", async () => {
  const store = new JobStore(async () => null);
  const job = await store.create(input);
  assert.equal(job.engine, "hanuman-native-v1");
  assert.equal((await store.create(input)).id, job.id);
  await store.update(job.id, { status: "completed", durationSec: 1 });
  assert.equal((await store.create(input)).status, "completed");
  assert.equal((await store.listActive()).length, 0);
  for (const status of ["failed", "cancelled"] as const) {
    const fresh = await store.create({ ...input, externalId: status });
    await store.setStatus(fresh.id, status);
    const replacement = await store.create({ ...input, externalId: status });
    assert.notEqual(replacement.id, fresh.id);
    await store.delete(fresh.id);
    assert.equal((await store.create({ ...input, externalId: status })).id, replacement.id, "Deleting old outcome must not delete the replacement mapping");
  }
});
test("cancellation preserves a completed artifact", async () => {
  const job = await jobStore.create({ ...input, externalId: "completed-proof" });
  await jobStore.update(job.id, { status: "completed", artifactUrl: "https://example.test/final.mp4" });
  assert.equal((await cancelRenderJob(job.id))?.status, "completed");
  assert.equal((await jobStore.get(job.id))?.artifactUrl, "https://example.test/final.mp4");
  await jobStore.delete(job.id);
});
test("queued jobs cancel without starting a process", async () => {
  const job = await jobStore.create({ ...input, externalId: "cancel-proof" });
  assert.equal((await cancelRenderJob(job.id))?.status, "cancelled");
  assert.equal((await jobStore.get(job.id))?.workerPid, null);
  await jobStore.delete(job.id);
});
