import Redis from "ioredis";
import { config } from "./env.config";

// Redis is optional: without REDIS_URL caching is simply off. When it IS
// configured but unreachable, commands fail fast (no offline queue, 1 retry)
// and the cache layer treats every failure as a miss — the API keeps working,
// just without the speed-up.

let redis: Redis | null = null;

export const getRedisClient = (): Redis | null => {
  if (!config.redisUrl) return null;

  if (!redis) {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false, // don't pile up commands while disconnected
      connectTimeout: 5000,
      commandTimeout: 1000, // a slow cache is worse than no cache
      keepAlive: 10000,
      enableAutoPipelining: true,
      // Back off up to 10s between reconnect attempts, forever.
      retryStrategy: (times) => Math.min(times * 500, 10000),
    });

    // Log state changes once instead of an error per failed reconnect.
    let lastState = "";
    const logState = (state: string, message: string) => {
      if (state === lastState) return;
      lastState = state;
      console.log(message);
    };
    redis.on("ready", () => logState("ready", "✅ Redis connected — caching enabled"));
    redis.on("error", (err) =>
      logState("error", `⚠️ Redis unavailable (${err.message}) — serving without cache`)
    );
  }

  return redis;
};

/** True when a Redis client exists and is connected. */
export const isRedisReady = (): boolean => redis?.status === "ready";

export const disconnectRedis = async (): Promise<void> => {
  if (redis) {
    await redis.quit().catch(() => redis?.disconnect());
    redis = null;
  }
};
