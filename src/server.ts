import app from "./app";
import { config, validateEnv } from "./config/env.config";
import {
  testDatabaseConnection,
  disconnectDatabase,
} from "./config/database.config";
import { SeedService } from "./services/seed.service";
import { getRedisClient, disconnectRedis } from "./config/redis.config";
import { EmailService } from "./services/email.service";
import { deactivateExpiredEvents } from "./controllers/upcomingEvent.controller";
import { CacheService } from "./services/cache.service";
import { InstagramService } from "./services/instagram.service";

// Validate environment variables on startup
try {
  validateEnv();
} catch (error) {
  console.error("❌ Environment validation failed:", error);
  process.exit(1);
}

const INSTAGRAM_UPKEEP_INTERVAL_MS = 12 * 60 * 60 * 1000;

const startServer = async (): Promise<void> => {
  try {
    const dbConnected = await testDatabaseConnection();

    if (!dbConnected) {
      console.error("❌ Failed to connect to database. Exiting...");
      process.exit(1);
    }

    // Connect to Redis in the background (optional — skipped if REDIS_URL unset).
    // Once connected, drop whatever the previous run cached: after a deploy the
    // new code may shape responses differently than the cached ones.
    getRedisClient()?.once("ready", () => void CacheService.clearAll());

    // Check the SMTP login in the background so a typo shows up at startup
    // rather than on the first inquiry.
    void EmailService.verify();

    // Turn off upcoming events whose date has passed: now, then every hour.
    const expireEvents = () =>
      deactivateExpiredEvents().catch((e) => console.error("❌ Expiring events failed:", e.message));
    void expireEvents();
    setInterval(expireEvents, 60 * 60 * 1000).unref();

    // Create the default admin account if it isn't there yet
    await SeedService.runSeed();

    // Keep the Instagram access token alive: check now, then twice a day,
    // renewing it when it's due. (Requests for the feed run the same check,
    // so it still happens on hosts that put an idle server to sleep.)
    void InstagramService.runUpkeep();
    setInterval(() => void InstagramService.runUpkeep(), INSTAGRAM_UPKEEP_INTERVAL_MS).unref();

    app.listen(config.port, () => {
      console.log("=================================");
      console.log(`🚀 Server running on port ${config.port}`);
      console.log(`📍 http://localhost:${config.port}/api/health`);
      console.log(`⚡ Environment: ${config.nodeEnv}`);
      console.log("=================================");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

// Handle shutdown gracefully
const shutdown = async (signal: string): Promise<void> => {
  console.log(`\n🛑 ${signal} received — shutting down gracefully...`);
  await Promise.all([disconnectDatabase(), disconnectRedis()]);
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason: Error) => {
  console.error("❌ Unhandled Rejection:", reason);
  process.exit(1);
});

process.on("uncaughtException", (error: Error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});
