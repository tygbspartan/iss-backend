import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import { requestLogger } from "./middleware/logger.middleware";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/errorHandler.middleware";
import apiRoutes from "./routes";
import { config } from "./config/env.config";

const app: Application = express();

// Behind a reverse proxy in production so the client IP comes from
// X-Forwarded-For rather than the proxy's own address.
app.set("trust proxy", 1);

// Security headers
app.use(helmet());

// Middleware
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);
app.use(express.json({ limit: "500kb" }));
app.use(express.urlencoded({ extended: true, limit: "500kb" }));
app.use(requestLogger);

// API routes
app.use("/api", apiRoutes);

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
