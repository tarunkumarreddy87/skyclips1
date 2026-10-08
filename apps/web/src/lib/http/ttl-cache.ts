/** Simple in-memory TTL cache. Not for secrets or long-lived presigned query strings. */

export type TtlEntry<T> = {
  value: T;
  expiresAt: number;
};

export class TtlCache<T> {
  private readonly map = new Map<string, TtlEntry<T>>();

  constructor(private readonly maxEntries = 200) {}

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    if (ttlMs <= 0) return;
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}
