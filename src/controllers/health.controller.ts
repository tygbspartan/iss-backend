import { Request, Response } from "express";
import prisma from "../config/database.config";
import { config } from "../config/env.config";
import { isRedisReady } from "../config/redis.config";

/**
 * Liveness + DB readiness. Returns 503 when the database is unreachable so
 * uptime checks and load balancers can tell a half-up server from a healthy one.
 */
export const getHealth = async (_req: Request, res: Response): Promise<void> => {
  let database = "connected";
  let statusCode = 200;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    database = "disconnected";
    statusCode = 503;
    console.error("❌ Health check — database unreachable:", error);
  }

  res.status(statusCode).json({
    status: statusCode === 200 ? "success" : "error",
    message: "API is running",
    database,
    // Redis is optional, so its state is reported but never fails the check.
    cache: !config.redisUrl ? "disabled" : isRedisReady() ? "connected" : "unavailable",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};
