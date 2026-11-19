import { Request, Response, NextFunction } from "express";
import { CacheService } from "../services/cache.service";

/**
 * Cache a public GET response in Redis, keyed by its full URL (so query params
 * like ?page= or ?service= get their own entries). Only 200 responses are
 * stored. Adds an `X-Cache: HIT | MISS` header to make behaviour visible.
 *
 * Use on PUBLIC routes only — admin routes must always read fresh data.
 */
export const cacheResponse =
  (namespace: string, ttlSeconds: number) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `${namespace}:${req.originalUrl}`;

    const cached = await CacheService.get<unknown>(key);
    if (cached !== null) {
      res.setHeader("X-Cache", "HIT");
      res.json(cached);
      return;
    }

    res.setHeader("X-Cache", "MISS");
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode === 200) {
        // Fire-and-forget: never delay the response for the cache write.
        void CacheService.set(key, body, ttlSeconds);
      }
      return originalJson(body);
    };
    next();
  };

/**
 * Router-level middleware: after any successful write (POST/PATCH/PUT/DELETE)
 * clear the given cache namespaces. Invalidation finishes BEFORE the response
 * is sent, so a client that refetches right after a save never sees stale data.
 */
export const invalidateCacheOnWrite =
  (...namespaces: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return next();
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode >= 400) return originalJson(body);
      CacheService.invalidate(...namespaces).finally(() => originalJson(body));
      return res;
    };
    next();
  };
