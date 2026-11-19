import { config } from "../config/env.config";
import { getRedisClient, isRedisReady } from "../config/redis.config";

// Every key lives under this prefix so the app can share a Redis instance
// with other projects — and its own dev/prod — without reading or wiping
// anyone else's keys (e.g. "iss:production:cache:services:/api/services").
const PREFIX = `iss:${config.nodeEnv}:cache:`;

// All methods swallow errors: a cache failure must never fail a request.
export const CacheService = {
  async get<T>(key: string): Promise<T | null> {
    const client = getRedisClient();
    if (!client || !isRedisReady()) return null;
    try {
      const data = await client.get(PREFIX + key);
      return data ? (JSON.parse(data) as T) : null;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const client = getRedisClient();
    if (!client || !isRedisReady()) return;
    try {
      await client.set(PREFIX + key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      /* cache miss next time — always safe */
    }
  },

  /** Delete every key in the given namespaces (e.g. "services", "projects"). */
  async invalidate(...namespaces: string[]): Promise<void> {
    const client = getRedisClient();
    if (!client || !isRedisReady()) return;
    try {
      for (const ns of namespaces) {
        let cursor = "0";
        do {
          const [next, keys] = await client.scan(cursor, "MATCH", `${PREFIX}${ns}:*`, "COUNT", 200);
          cursor = next;
          if (keys.length) await client.unlink(...keys);
        } while (cursor !== "0");
      }
    } catch (error) {
      // Entries still expire via their TTL, so stale data is bounded.
      console.warn("⚠️ Cache invalidation failed:", (error as Error).message);
    }
  },

  /**
   * Delete everything this app has cached (only keys under its own prefix).
   * Run at startup: a new version of the code may shape responses differently,
   * and responses cached by the previous version must not outlive it.
   */
  async clearAll(): Promise<void> {
    const client = getRedisClient();
    if (!client || !isRedisReady()) return;
    try {
      let cursor = "0";
      do {
        const [next, keys] = await client.scan(cursor, "MATCH", `${PREFIX}*`, "COUNT", 200);
        cursor = next;
        if (keys.length) await client.unlink(...keys);
      } while (cursor !== "0");
    } catch (error) {
      console.warn("⚠️ Clearing the cache at startup failed:", (error as Error).message);
    }
  },
};

// TTLs in seconds. Writes invalidate immediately, so these only bound how long
// a missed invalidation (e.g. Redis blip during a write) can serve stale data.
export const TTL = {
  LIST: 300, // 5 min
  DETAIL: 600, // 10 min
};
