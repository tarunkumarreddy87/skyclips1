import { createHash, randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import type { RenderJobRecord, RenderJobStatus, StartRenderRequest } from "../types.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

let connection: Promise<Redis> | undefined;
async function getRedis(): Promise<Redis | null> {
  if (!config.REDIS_URL) return null;
  connection ??= (async () => {
    const client = new Redis(config.REDIS_URL!, {
      lazyConnect: true, maxRetriesPerRequest: 2, connectTimeout: 3000,
      enableReadyCheck: true,
    });
    client.on("error", (err) => logger.warn({ message: err.message }, "Render store connection error"));
    try {
      await client.connect();
      return client;
    } catch (err) {
      client.disconnect();
      throw err;
    }
  })().catch((err) => { connection = undefined; throw err; });
  // A configured store outage must never fork an invisible in-memory queue.
  return connection;
}

const JOB = (id: string) => `render:job:${id}`;
const EXT = (id: string) => `render:ext:${createHash("sha256").update(id).digest("hex")}`;
const ACTIVE = "render:active";
const LEASE = (id: string) => `render:lease:${id}`;
const SLOT = (index: number) => `render:capacity:${index}`;
const CAPACITY = config.RENDER_GLOBAL_MAX_CONCURRENT ?? config.RENDER_MAX_CONCURRENT;
const TERMINAL = new Set<RenderJobStatus>(["completed", "failed", "cancelled"]);
/** Terminal states a resubmission with the same externalId must not reattach to. */
const REPLACEABLE = new Set<RenderJobStatus>(["failed", "cancelled"]);
const TTL = Math.ceil(config.RENDER_JOB_TTL_MS / 1000);
const LEASE_MS = 120_000;
export type RenderLease = { jobId: string; token: string; slot: number };

// Redis Lua cjson cannot round-trip empty arrays. Keep the entire timeline opaque.
function encodeRecord(job: Partial<RenderJobRecord>): string {
  const { manifest, ...record } = job;
  return JSON.stringify({ ...record, ...(manifest ? { manifestJson: JSON.stringify(manifest) } : {}) });
}
function decodeRecord(raw: string): RenderJobRecord {
  const { manifestJson, ...record } = JSON.parse(raw);
  return { engine: "hanuman-native-v1", encoder: null, workerPid: null, ...record, ...(manifestJson ? { manifest: JSON.parse(manifestJson) } : {}) };
}

export class JobStore {
  private jobs = new Map<string, RenderJobRecord>();
  private externalIds = new Map<string, string>();
  private memoryLeases = new Map<number, RenderLease & { expires: number }>();
  constructor(private redisProvider: () => Promise<Redis | null> = getRedis) {}

  async create(input: StartRenderRequest): Promise<RenderJobRecord> {
    const redis = await this.redisProvider();
    const now = new Date().toISOString();
    const job: RenderJobRecord = {
      id: randomUUID(), manifest: input.manifest, status: "queued",
      projectId: input.projectId, runId: input.runId, outputKey: input.outputKey,
      externalId: input.externalId, progress: 0, message: "Queued",
      costUsd: null, outputUrl: null, artifactUrl: null, error: null,
      retryCount: 0, maxRetries: config.RENDER_JOB_MAX_RETRIES,
      createdAt: now, updatedAt: now, startedAt: null, completedAt: null,
      durationSec: null, engine: "hanuman-native-v1", encoder: null, workerPid: null,
    };
    if (redis) {
      // Reserve external id + create job + enqueue atomically across ECS replicas.
      // Live or completed jobs are reused; a failed/cancelled job is replaced so a
      // retried activity is not reattached to a dead render.
      const raw = await redis.eval(`
        if ARGV[3] == '1' then
          local id = redis.call('GET', KEYS[2])
          if id then
            local existing = redis.call('GET', 'render:job:' .. id)
            if existing then
              local status = cjson.decode(existing).status
              if status ~= 'failed' and status ~= 'cancelled' then return existing end
            end
          end
        end
        redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
        if ARGV[3] == '1' then redis.call('SET', KEYS[2], ARGV[4], 'EX', ARGV[2]) end
        redis.call('SADD', KEYS[3], ARGV[4])
        return ARGV[1]
      `, 3, JOB(job.id), EXT(input.externalId ?? job.id), ACTIVE,
      encodeRecord(job), TTL, input.externalId ? "1" : "0", job.id);
      return decodeRecord(String(raw));
    }
    const existingId = input.externalId ? this.externalIds.get(input.externalId) : undefined;
    const existing = existingId ? this.jobs.get(existingId) : undefined;
    if (existing && !REPLACEABLE.has(existing.status)) return existing;
    this.jobs.set(job.id, job);
    if (input.externalId) this.externalIds.set(input.externalId, job.id);
    return job;
  }

  async get(id: string): Promise<RenderJobRecord | undefined> {
    const redis = await this.redisProvider();
    if (!redis) return this.jobs.get(id);
    const raw = await redis.get(JOB(id));
    return raw ? decodeRecord(raw) : undefined;
  }

  async update(id: string, patch: Partial<RenderJobRecord>, lease?: RenderLease): Promise<RenderJobRecord | undefined> {
    if (lease && lease.jobId !== id) return undefined;
    const redis = await this.redisProvider();
    const change = { ...patch, updatedAt: new Date().toISOString() };
    if (redis) {
      const raw = await redis.eval(`
        local raw = redis.call('GET', KEYS[1])
        if not raw then return nil end
        local job = cjson.decode(raw)
        if ARGV[3] ~= '' and (redis.call('GET', KEYS[3]) ~= ARGV[3] or redis.call('GET', KEYS[4]) ~= ARGV[3]) then return nil end
        if job.status == 'completed' or job.status == 'failed' or job.status == 'cancelled' then return raw end
        local patch = cjson.decode(ARGV[1])
        for k,v in pairs(patch) do job[k] = v end
        if job.status == 'completed' or job.status == 'failed' or job.status == 'cancelled' then
          redis.call('SREM', KEYS[2], job.id)
          job.manifest = nil
          job.manifestJson = nil
        end
        local encoded = cjson.encode(job)
        redis.call('SET', KEYS[1], encoded, 'EX', ARGV[2])
        return encoded
      `, 4, JOB(id), ACTIVE, LEASE(id), SLOT(lease?.slot ?? 0), encodeRecord(change), TTL, lease?.token ?? "");
      return raw ? decodeRecord(String(raw)) : undefined;
    }
    if (lease && (this.memoryLeases.get(lease.slot)?.token !== lease.token || this.memoryLeases.get(lease.slot)!.expires <= Date.now())) return undefined;
    const job = this.jobs.get(id);
    if (!job || TERMINAL.has(job.status)) return job;
    const updated = { ...job, ...change };
    if (TERMINAL.has(updated.status)) delete updated.manifest;
    this.jobs.set(id, updated);
    return updated;
  }

  async setStatus(id: string, status: RenderJobStatus, message?: string) {
    const current = await this.get(id);
    return this.update(id, { status, ...(message ? { message } : {}),
      ...(status === "starting" && !current?.startedAt ? { startedAt: new Date().toISOString() } : {}),
      ...(TERMINAL.has(status) ? { completedAt: new Date().toISOString() } : {}),
    });
  }

  async listActive(): Promise<RenderJobRecord[]> {
    const redis = await this.redisProvider();
    if (!redis) {
      for (const [id, job] of this.jobs) {
        if (TERMINAL.has(job.status) && Date.now() - Date.parse(job.updatedAt) > config.RENDER_JOB_TTL_MS) {
          this.jobs.delete(id);
          // The mapping may already point at a replacement job for the same externalId.
          if (job.externalId && this.externalIds.get(job.externalId) === id) this.externalIds.delete(job.externalId);
        }
      }
      return [...this.jobs.values()].filter(j => !TERMINAL.has(j.status));
    }
    const ids = await redis.smembers(ACTIVE);
    const jobs = await Promise.all(ids.map(id => this.get(id)));
    const stale = ids.filter((_, i) => !jobs[i] || TERMINAL.has(jobs[i]!.status));
    if (stale.length) await redis.srem(ACTIVE, ...stale);
    return jobs.filter((j): j is RenderJobRecord => Boolean(j) && !TERMINAL.has(j!.status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async claim(jobId: string): Promise<RenderLease | undefined> {
    const token = randomUUID();
    const redis = await this.redisProvider();
    if (redis) {
      const selected = Number(await redis.eval(`
        if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
        for index = 2, #KEYS do
          if redis.call('EXISTS', KEYS[index]) == 0 then
            redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
            redis.call('SET', KEYS[index], ARGV[1], 'PX', ARGV[2])
            return index - 1
          end
        end
        return 0
      `, CAPACITY + 1, LEASE(jobId), ...Array.from({ length: CAPACITY }, (_, index) => SLOT(index)), token, LEASE_MS));
      return selected ? { jobId, token, slot: selected - 1 } : undefined;
    }
    for (const held of this.memoryLeases.values()) if (held.jobId === jobId && held.expires > Date.now()) return undefined;
    for (let slot = 0; slot < CAPACITY; slot++) {
      if ((this.memoryLeases.get(slot)?.expires ?? 0) > Date.now()) continue;
      const lease = { jobId, token, slot };
      this.memoryLeases.set(slot, { ...lease, expires: Date.now() + LEASE_MS });
      return lease;
    }
    return undefined;
  }

  async renew(lease: RenderLease): Promise<boolean> {
    const redis = await this.redisProvider();
    if (redis) return (await redis.eval(`
      if redis.call('GET', KEYS[1]) ~= ARGV[1] or redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
      redis.call('PEXPIRE', KEYS[1], ARGV[2])
      redis.call('PEXPIRE', KEYS[2], ARGV[2])
      return 1
    `, 2, LEASE(lease.jobId), SLOT(lease.slot), lease.token, LEASE_MS)) === 1;
    const held = this.memoryLeases.get(lease.slot);
    if (held?.token !== lease.token || held.expires <= Date.now()) return false;
    held.expires = Date.now() + LEASE_MS;
    return true;
  }

  async release(lease: RenderLease): Promise<void> {
    const redis = await this.redisProvider();
    if (redis) await redis.eval(`
      for _, key in ipairs(KEYS) do
        if redis.call('GET', key) == ARGV[1] then redis.call('DEL', key) end
      end
    `, 2, LEASE(lease.jobId), SLOT(lease.slot), lease.token);
    else if (this.memoryLeases.get(lease.slot)?.token === lease.token) this.memoryLeases.delete(lease.slot);
  }

  async delete(id: string): Promise<boolean> {
    const job = await this.get(id);
    const redis = await this.redisProvider();
    if (redis) {
      // Only drop the externalId mapping if it still points at this job (not a replacement).
      if (job?.externalId) {
        await redis.eval(`
          if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
          return 0
        `, 1, EXT(job.externalId), id);
      }
      await redis.srem(ACTIVE, id);
      return (await redis.del(JOB(id))) > 0;
    }
    if (job?.externalId && this.externalIds.get(job.externalId) === id) this.externalIds.delete(job.externalId);
    return this.jobs.delete(id);
  }
}
export const jobStore = new JobStore();
