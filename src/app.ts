import express, { Application } from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import { PUBLIC_UPLOADS_PREFIX } from "./services/storage.service";
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

// Serve locally-stored uploads in production (the local-disk storage driver on
// cPanel/VPS). The CORP header is required: helmet's default same-origin CORP
// makes the browser block these images on the separate-origin frontend. Scoped
// to /uploads so API responses keep the stricter default.
if (config.isProduction) {
  app.use(
    PUBLIC_UPLOADS_PREFIX,
    (_req, res, next) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(path.resolve(config.uploadDir), { index: false, dotfiles: "deny" })
  );
}

// API routes
app.use("/api", apiRoutes);

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
