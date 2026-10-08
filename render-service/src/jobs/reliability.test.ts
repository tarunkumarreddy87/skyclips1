import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { JobStore } from "./job-store.js";
import { RenderWorkerPool, type NativeRenderOutcome } from "./render-worker.js";
import type { StartRenderRequest } from "../types.js";
const input = { projectId: "p", runId: "r", externalId: "native-test:p:r", outputKey: "projects/p/r/final.mp4", manifest: { metadata: { duration_sec: 4, fps: 30 }, tracks: { video: [], captions: [], music: [] } } } as unknown as StartRenderRequest;
const outcome: NativeRenderOutcome = { durationSec: 4, encoder: "libx264" };
const presign = async () => "https://example.test/final.mp4";
async function until(fn: () => Promise<boolean>) {
  for (let i = 0; i < 400; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 5)); }
  throw new Error("Native test job did not settle");
}
test("concurrent submissions deduplicate and terminal cancellation is immutable", async () => {
  const store = new JobStore(async () => null);
  const jobs = await Promise.all(Array.from({ length: 20 }, () => store.create(input)));
  assert.equal(new Set(jobs.map(j => j.id)).size, 1);
  await store.setStatus(jobs[0]!.id, "cancelled");
  await store.update(jobs[0]!.id, { status: "rendering", progress: 80 });
  assert.equal((await store.get(jobs[0]!.id))?.status, "cancelled");
  assert.equal((await store.listActive()).length, 0);
});
test("shared capacity leases fence stale owners", async () => {
  const store = new JobStore(async () => null);
  const lease = (await store.claim("a"))!;
  assert.ok(lease); assert.equal(await store.claim("a"), undefined); assert.equal(await store.claim("b"), undefined);
  await store.release({ ...lease, token: "stale" });
  assert.equal(await store.claim("b"), undefined);
  assert.equal(await store.renew({ ...lease, token: "stale" }), false);
  await store.release(lease); assert.ok(await store.claim("b"));
});
test("repeated enqueue runs the native process once", async () => {
  const store = new JobStore(async () => null); let renders = 0;
  const worker = new RenderWorkerPool(store, async args => { renders++; await args.onStarted(123); await args.onProgress(50, "Frames"); return outcome; }, presign);
  const job = await store.create(input);
  for (let i = 0; i < 10; i++) worker.enqueue(job);
  await until(async () => (await store.get(job.id))?.status === "completed");
  assert.equal(renders, 1); assert.equal((await store.get(job.id))?.encoder, "libx264");
  assert.equal((await store.get(job.id))?.workerPid, null); assert.equal((await store.get(job.id))?.manifest, undefined);
  worker.enqueue((await store.get(job.id))!); await new Promise(r => setTimeout(r, 10)); assert.equal(renders, 1);
  worker.stopRecovery();
});
test("retry starts a fresh native attempt from persisted source", async () => {
  const store = new JobStore(async () => null); let calls = 0;
  const worker = new RenderWorkerPool(store, async args => {
    assert.deepEqual(args.manifest, input.manifest); await args.onStarted(calls + 200);
    if (++calls === 1) throw new Error("Temporary object download failure"); return outcome;
  }, presign, async () => {});
  const job = await store.create(input); worker.enqueue(job);
  await until(async () => (await store.get(job.id))?.status === "completed");
  assert.equal(calls, 2); assert.equal((await store.get(job.id))?.retryCount, 1); worker.stopRecovery();
});
test("restarted worker recovers an abandoned native job from its complete timeline", async () => {
  const store = new JobStore(async () => null); const job = await store.create(input);
  await store.update(job.id, { status: "rendering", workerPid: 999, progress: 55 });
  let recovered = false;
  const worker = new RenderWorkerPool(store, async args => { assert.deepEqual(args.manifest.tracks.video, []); recovered = true; await args.onStarted(222); return outcome; }, presign);
  worker.startRecovery();
  try { await until(async () => (await store.get(job.id))?.status === "completed"); assert.ok(recovered); }
  finally { worker.stopRecovery(); }
});

test("graceful shutdown stops native work and leaves source recoverable", async () => {
  const store = new JobStore(async () => null);
  let started = false;
  const worker = new RenderWorkerPool(store, async args => {
    await args.onStarted(123);
    started = true;
    return await new Promise<NativeRenderOutcome>((_resolve, reject) => {
      args.signal.addEventListener("abort", () => reject(args.signal.reason), { once: true });
    });
  }, presign);
  const job = await store.create(input);
  worker.enqueue(job);
  await until(async () => started);
  await worker.stopRecovery();
  const stopped = (await store.get(job.id))!;
  assert.notEqual(stopped.status, "completed");
  assert.notEqual(stopped.status, "failed");
  assert.deepEqual(stopped.manifest, input.manifest);
  const next = new RenderWorkerPool(store, async () => outcome, presign);
  try {
    next.startRecovery();
    await until(async () => (await store.get(job.id))?.status === "completed");
  } finally { await next.stopRecovery(); }
});
test("cancellation during native work cannot publish or revive the job", async () => {
  const store = new JobStore(async () => null); let finish!: () => void, started = false, publishes = 0;
  const wait = new Promise<void>(resolve => { finish = resolve; });
  const worker = new RenderWorkerPool(store, async args => { await args.onStarted(123); started = true; await wait; return outcome; }, async () => { publishes++; return "artifact"; });
  const job = await store.create(input); worker.enqueue(job); await until(async () => started);
  await store.setStatus(job.id, "cancelled"); finish();
  await new Promise(r => setTimeout(r, 30));
  assert.equal((await store.get(job.id))?.status, "cancelled"); assert.equal(publishes, 0); worker.stopRecovery();
});
test("configured durable-store outage never creates an in-memory queue", async () => {
  const store = new JobStore(async () => { throw new Error("Redis unavailable"); });
  await assert.rejects(store.create(input), /Redis unavailable/);
  await assert.rejects(store.listActive(), /Redis unavailable/);
});
test("ownership loss prevents completing a native attempt", async () => {
  const store = new JobStore(async () => null); const original = store.update.bind(store);
  let lost = false;
  store.update = async (id, patch, lease) => lost && lease ? undefined : original(id, patch, lease);
  const worker = new RenderWorkerPool(store, async args => { await args.onStarted(123); lost = true; await args.onProgress(80, "Ownership lost"); return outcome; }, presign);
  const job = await store.create(input); worker.enqueue(job); await new Promise(r => setTimeout(r, 40));
  assert.notEqual((await store.get(job.id))?.status, "completed"); worker.stopRecovery();
});
test("Redis replicas atomically deduplicate, fence updates, retain arrays and recover source", { skip: !process.env.RENDER_TEST_REDIS_URL }, async () => {
  const redis = new Redis(process.env.RENDER_TEST_REDIS_URL!); const a = new JobStore(async () => redis), b = new JobStore(async () => redis);
  const request = { ...input, externalId: `native-test:${randomUUID()}` }; let id: string | undefined; let replacementId: string | undefined;
  try {
    const jobs = await Promise.all(Array.from({ length: 30 }, (_, i) => (i % 2 ? a : b).create(request)));
    id = jobs[0]!.id; assert.equal(new Set(jobs.map(j => j.id)).size, 1);
    const lease = (await a.claim(id))!; assert.ok(lease); assert.equal(await b.claim(id), undefined);
    await a.update(id, { status: "rendering", workerPid: 123 }, lease);
    assert.deepEqual((await b.get(id))?.manifest, input.manifest);
    assert.deepEqual((await b.listActive()).find(j => j.id === id)?.manifest?.tracks.video, []);
    assert.equal(await b.update(id, { progress: 95 }, { ...lease, token: "stale" }), undefined);
    await b.setStatus(id, "cancelled");
    assert.equal((await a.update(id, { status: "completed" }, lease))?.status, "cancelled");
    assert.equal((await b.get(id))?.manifest, undefined);
    await a.release(lease);
    const replacement = await b.create(request); replacementId = replacement.id;
    assert.notEqual(replacementId, id, "A cancelled durable job must be replaced on resubmission");
    await a.delete(id);
    assert.equal((await a.create(request)).id, replacementId, "Deleting an older outcome must preserve the current external-ID mapping");
  } finally { if (id) await a.delete(id); if (replacementId) await a.delete(replacementId); await redis.quit(); }
});
