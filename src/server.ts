import app from "./app";
import { config, validateEnv } from "./config/env.config";
import {
  testDatabaseConnection,
  disconnectDatabase,
} from "./config/database.config";
import { SeedService } from "./services/seed.service";

// Validate environment variables on startup
try {
  validateEnv();
} catch (error) {
  console.error("❌ Environment validation failed:", error);
  process.exit(1);
}

const startServer = async (): Promise<void> => {
  try {
    const dbConnected = await testDatabaseConnection();

    if (!dbConnected) {
      console.error("❌ Failed to connect to database. Exiting...");
      process.exit(1);
    }

    // Create the default admin account if it isn't there yet
    await SeedService.runSeed();

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
  await disconnectDatabase();
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
