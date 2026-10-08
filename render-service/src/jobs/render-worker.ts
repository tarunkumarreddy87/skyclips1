import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { TimelineManifestV1 } from "@hanuman/shared-types";
import { config } from "../config.js";
import { presignArtifact } from "../native/artifacts.js";
import { JobStore, jobStore } from "./job-store.js";
import type { RenderJobRecord, StartRenderRequest } from "../types.js";
import { logger } from "../utils/logger.js";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const localPython = path.join(repoRoot, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const python = config.RENDER_PYTHON_EXECUTABLE ?? (existsSync(localPython) ? localPython : "python3");
class LeaseLostError extends Error {}
class RenderStoppedError extends Error {}
export interface NativeRenderOutcome { durationSec: number; encoder: string }
export interface NativeRenderArgs {
  jobId: string; manifest: TimelineManifestV1; outputKey: string; signal: AbortSignal;
  assertActive: () => Promise<void>;
  onStarted: (pid: number | null) => Promise<void>;
  onProgress: (progress: number, message: string) => Promise<void>;
}
export type NativeRender = (args: NativeRenderArgs) => Promise<NativeRenderOutcome>;

function stopProcess(child: ChildProcess, hard = false): void {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("error", () => child.kill());
  } else {
    try { process.kill(-child.pid, hard ? "SIGKILL" : "SIGTERM"); } catch { child.kill(hard ? "SIGKILL" : "SIGTERM"); }
  }
}

/** A native attempt always restarts from source; it never resumes a stale process id. */
export async function executeNativeRender(args: NativeRenderArgs): Promise<NativeRenderOutcome> {
  args.signal.throwIfAborted();
  const directory = await mkdtemp(path.join(os.tmpdir(), "hanuman-job-"));
  try {
    const request = path.join(directory, "request.json");
    await writeFile(request, JSON.stringify({ manifest: args.manifest, outputKey: args.outputKey }));
    await args.assertActive();
    return await new Promise((resolve, reject) => {
      const child = spawn(python, ["-m", "src.render.native_cli", request], {
        cwd: path.join(repoRoot, "workers/media"), detached: process.platform !== "win32", windowsHide: true,
        env: { ...process.env, PYTHONPATH: path.join(repoRoot, "workers/media"), RENDER_ENGINE: "native-local",
          RENDER_ENCODER: config.RENDER_ENCODER, RENDER_PARALLEL_SECTIONS: String(config.RENDER_PARALLEL_SECTIONS),
          S3_BUCKET: config.S3_BUCKET_NAME, S3_REGION: config.S3_REGION, S3_ENDPOINT: config.S3_ENDPOINT ?? "",
          S3_ACCESS_KEY: config.S3_ACCESS_KEY ?? "", S3_SECRET_KEY: config.S3_SECRET_KEY ?? "" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let result: NativeRenderOutcome | undefined, failure: unknown, stderr = "", timedOut = false;
      let hardStop: ReturnType<typeof setTimeout> | undefined;
      const stop = () => {
        stopProcess(child);
        hardStop ??= setTimeout(() => stopProcess(child, true), 5000);
        hardStop.unref();
      };
      const timeout = setTimeout(() => { timedOut = true; stop(); }, config.RENDER_JOB_TIMEOUT_MS);
      args.signal.addEventListener("abort", stop, { once: true });
      if (args.signal.aborted) stop();
      let callbacks = args.onStarted(child.pid ?? null).catch(error => { failure = error; stop(); });
      child.stderr!.on("data", (buffer: Buffer) => { stderr = (stderr + buffer.toString()).slice(-6000); });
      const lines = createInterface({ input: child.stdout! });
      lines.on("line", line => {
        let event: { type?: string; progress?: number; message?: string; durationSec?: number; encoder?: string };
        try { event = JSON.parse(line); } catch { logger.debug({ jobId: args.jobId, line: line.slice(0, 300) }, "Worker output"); return; }
        if (event.type === "result" && typeof event.durationSec === "number" && event.encoder) result = { durationSec: event.durationSec, encoder: event.encoder };
        if (event.type === "progress" && typeof event.progress === "number") callbacks = callbacks.then(async () => {
          if (failure) return;
          await args.assertActive();
          await args.onProgress(event.progress!, event.message ?? "Rendering");
        }).catch(error => { failure = error; stop(); });
      });
      const cleanup = () => { clearTimeout(timeout); clearTimeout(hardStop); lines.close(); args.signal.removeEventListener("abort", stop); };
      child.on("error", error => { cleanup(); reject(error); });
      child.on("close", code => {
        cleanup();
        void callbacks.then(() => {
          if (failure) reject(failure);
          else if (args.signal.aborted) reject(args.signal.reason ?? new RenderStoppedError("Render stopped"));
          else if (code === 0 && result) resolve(result);
          else reject(new Error(timedOut ? "Native render timed out" : stderr || `Native render exited with code ${code}`));
        }, reject);
      });
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export class RenderWorkerPool {
  private active = 0;
  private queue: RenderJobRecord[] = [];
  private scheduled = new Set<string>();
  private controllers = new Map<string, AbortController>();
  private timer?: ReturnType<typeof setInterval>;
  private recovering = false;
  private stopping = false;
  private running = new Set<Promise<void>>();
  constructor(private store: JobStore = jobStore, private render: NativeRender = executeNativeRender,
    private presign = presignArtifact, private sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))) {}

  enqueue(job: RenderJobRecord, manifest?: TimelineManifestV1): void {
    if (this.stopping || TERMINAL.has(job.status) || this.scheduled.has(job.id)) return;
    this.scheduled.add(job.id);
    this.queue.push({ ...job, manifest: job.manifest ?? manifest });
    this.drain();
  }
  cancel(jobId: string): void { this.controllers.get(jobId)?.abort(new RenderStoppedError("Render cancelled")); }
  startRecovery(): void {
    if (this.timer) return;
    this.stopping = false;
    const recover = async () => {
      if (this.recovering || this.stopping) return;
      this.recovering = true;
      try { for (const job of await this.store.listActive()) this.enqueue(job); }
      catch (err) { logger.error({ err }, "Durable render recovery will retry when the store recovers"); }
      finally { this.recovering = false; }
    };
    this.timer = setInterval(() => void recover(), 5000); this.timer.unref(); void recover();
  }
  async stopRecovery(): Promise<void> {
    this.stopping = true; clearInterval(this.timer); this.timer = undefined;
    for (const job of this.queue.splice(0)) this.scheduled.delete(job.id);
    for (const controller of this.controllers.values()) controller.abort(new LeaseLostError("Worker shutting down; job remains recoverable"));
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled([...this.running]),
        new Promise<void>(resolve => { timeout = setTimeout(resolve, 7000); }),
      ]);
    } finally { clearTimeout(timeout); }
  }
  private drain(): void {
    while (!this.stopping && this.active < config.RENDER_MAX_CONCURRENT && this.queue.length) {
      const job = this.queue.shift()!; this.active++;
      const running = this.runJob(job).catch(err => logger.error({ err, jobId: job.id }, "Job deferred to durable recovery"))
        .finally(() => { this.active--; this.scheduled.delete(job.id); this.running.delete(running); this.drain(); });
      this.running.add(running);
    }
  }
  private async runJob(queued: RenderJobRecord): Promise<void> {
    const lease = await this.store.claim(queued.id);
    if (!lease) return;
    if (this.stopping) { await this.store.release(lease); return; }
    const controller = new AbortController(); this.controllers.set(queued.id, controller);
    let ownershipLost = false, checking = false;
    const assertActive = async () => {
      controller.signal.throwIfAborted();
      const current = await this.store.get(queued.id);
      if (!current || TERMINAL.has(current.status)) throw new RenderStoppedError("Render stopped");
    };
    const update = async (patch: Partial<RenderJobRecord>) => {
      controller.signal.throwIfAborted();
      const updated = await this.store.update(queued.id, patch, lease);
      if (!updated) throw new LeaseLostError("Render ownership lost");
      if (updated.status === "cancelled") throw new RenderStoppedError("Render cancelled");
      return updated;
    };
    const heartbeat = setInterval(() => {
      if (checking) return; checking = true;
      void (async () => {
        if (!await this.store.renew(lease)) throw new LeaseLostError("Render ownership lost");
        await assertActive();
      })().catch(error => {
        ownershipLost = !(error instanceof RenderStoppedError);
        controller.abort(ownershipLost ? new LeaseLostError("Durable render store ownership unavailable") : error);
      }).finally(() => { checking = false; });
    }, 5000); heartbeat.unref();
    try {
      const initial = await this.store.get(queued.id);
      if (!initial || TERMINAL.has(initial.status)) return;
      const manifest = initial.manifest ?? queued.manifest;
      if (!manifest) { await update({ status: "failed", error: "No persisted source timeline; submit the render again", completedAt: new Date().toISOString() }); return; }
      await update({ status: "starting", workerPid: null, startedAt: initial.startedAt ?? new Date().toISOString(), message: "Preparing native render" });
      for (let attempt = initial.retryCount; attempt <= initial.maxRetries; attempt++) {
        try {
          await assertActive();
          await update({ retryCount: attempt, error: null });
          const outcome = await this.render({ jobId: queued.id, manifest, outputKey: initial.outputKey, signal: controller.signal,
            assertActive, onStarted: async workerPid => { await update({ workerPid }); },
            onProgress: async (progress, message) => { await update({ status: progress >= 99 ? "copying" : "rendering", progress, message }); },
          });
          await assertActive();
          let artifactUrl: string | null = null;
          try { artifactUrl = await this.presign(initial.outputKey); } catch (error) { logger.warn({ error, jobId: queued.id }, "Native output saved; presign unavailable"); }
          await update({ status: "completed", progress: 100, message: "Render complete", workerPid: null,
            durationSec: outcome.durationSec, encoder: outcome.encoder, artifactUrl, outputUrl: artifactUrl, completedAt: new Date().toISOString() });
          return;
        } catch (error) {
          if (ownershipLost || error instanceof LeaseLostError || error instanceof RenderStoppedError || controller.signal.aborted) return;
          const current = await this.store.get(queued.id);
          if (!current || TERMINAL.has(current.status)) return;
          const message = error instanceof Error ? error.message : String(error);
          const fatal = /invalid.manifest|validation.error|malformed|asset.*not found|unsupported|requested.*unavailable/i.test(message);
          logger.error({ jobId: queued.id, attempt, message }, "Native attempt failed");
          if (fatal || attempt >= initial.maxRetries) {
            await update({ status: "failed", workerPid: null, error: message, message: "Render failed", completedAt: new Date().toISOString() }); return;
          }
          await update({ status: "starting", workerPid: null, retryCount: attempt + 1, message: "Retrying native render from source", error: message });
          await this.sleep(1000 * (attempt + 1));
        }
      }
    } finally {
      clearInterval(heartbeat); this.controllers.delete(queued.id);
      try { await this.store.release(lease); } catch (error) { logger.warn({ error, jobId: queued.id }, "Lease release deferred to expiry"); }
    }
  }
}
export const renderWorkerPool = new RenderWorkerPool();
export async function startRenderJob(input: StartRenderRequest): Promise<RenderJobRecord> {
  const job = await jobStore.create(input); renderWorkerPool.enqueue(job); return job;
}
export async function cancelRenderJob(jobId: string): Promise<RenderJobRecord | undefined> {
  const job = await jobStore.get(jobId);
  if (!job || TERMINAL.has(job.status)) return job;
  const updated = await jobStore.setStatus(jobId, "cancelled", "Cancelled");
  renderWorkerPool.cancel(jobId); return updated;
}
