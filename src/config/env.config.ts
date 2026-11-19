import dotenv from "dotenv";
import path from "path";

dotenv.config();

interface EnvConfig {
  // Server
  port: number;
  nodeEnv: string;
  isProduction: boolean;
  clientUrl: string;

  // Database
  databaseUrl: string;

  // Default admin account (seeded on startup)
  adminUsername: string;
  adminPassword: string;

  // Auth
  jwtSecret: string;
  jwtExpiresIn: string;

  // Storage. The driver is chosen by NODE_ENV in storage.service.ts:
  // production → local disk (served from /uploads), otherwise → Supabase Storage.
  uploadDir: string; // root dir for local-disk uploads
  publicBaseUrl: string; // public origin that serves local uploads (no trailing slash)

  // Supabase Storage (development only)
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseStorageBucket: string;

  // Redis (optional — caching is disabled when unset)
  redisUrl: string | null;

  // Email over SMTP (optional — notifications are skipped when unset)
  smtp: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string; // "From" address shown to the recipient
    enabled: boolean; // true once host, user and pass are all set
  };
  // Where "Contact Us" submissions are emailed.
  contactNotifyEmail: string;

  // Instagram feed (optional). The starting access token — see instagram.service.ts.
  instagramAccessToken: string;
}

const getEnvVariable = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;
  if (!value && !defaultValue) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value as string;
};

// For variables only required in some environments — checked in validateEnv().
const getOptionalEnvVariable = (key: string): string => process.env[key] || "";

const nodeEnv = getEnvVariable("NODE_ENV", "development");

export const config: EnvConfig = {
  // Server
  port: parseInt(getEnvVariable("PORT", "5000")),
  nodeEnv,
  isProduction: nodeEnv === "production",
  clientUrl: getEnvVariable("CLIENT_URL", "http://localhost:3000"),

  // Database
  databaseUrl: getEnvVariable("DATABASE_URL"),

  // Default admin account
  adminUsername: getEnvVariable("ADMIN_USERNAME", "admin"),
  adminPassword: getEnvVariable("ADMIN_PASSWORD"),

  // Auth
  jwtSecret: getEnvVariable("JWT_SECRET"),
  jwtExpiresIn: getEnvVariable("JWT_EXPIRES_IN", "7d"),

  // Local-disk uploads root. Defaults to <project-root>/uploads; override with
  // UPLOAD_DIR (on cPanel/VPS point it OUTSIDE the deploy dir so redeploys don't wipe it).
  uploadDir: getEnvVariable("UPLOAD_DIR", path.join(__dirname, "../../uploads")),
  // Public origin of this API, baked into every locally-stored image URL.
  publicBaseUrl: getOptionalEnvVariable("PUBLIC_BASE_URL").replace(/\/+$/, ""),

  // Supabase Storage
  // Only the project origin is valid here. People often paste the REST URL
  // (…supabase.co/rest/v1/), which makes every storage call fail with
  // "Invalid path specified in request URL" — so keep just the origin.
  supabaseUrl: (() => {
    const raw = getOptionalEnvVariable("SUPABASE_URL");
    try {
      return raw ? new URL(raw).origin : "";
    } catch {
      return raw;
    }
  })(),
  supabaseServiceRoleKey: getOptionalEnvVariable("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseStorageBucket: getEnvVariable("SUPABASE_STORAGE_BUCKET", "images"),

  // Redis (optional)
  redisUrl: process.env.REDIS_URL || null,

  // Email (optional). 587 = STARTTLS (Gmail, most hosts); 465 = implicit TLS.
  smtp: {
    host: getOptionalEnvVariable("SMTP_HOST"),
    port: parseInt(getEnvVariable("SMTP_PORT", "587")),
    user: getOptionalEnvVariable("SMTP_USER"),
    pass: getOptionalEnvVariable("SMTP_PASS"),
    from: getOptionalEnvVariable("MAIL_FROM") || getOptionalEnvVariable("SMTP_USER"),
    enabled: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  },
  contactNotifyEmail: getEnvVariable("CONTACT_NOTIFY_EMAIL", "grishan.rocks@gmail.com"),

  // Instagram feed (optional)
  instagramAccessToken: getOptionalEnvVariable("INSTAGRAM_ACCESS_TOKEN").trim(),
};

// Validate critical env variables on startup
export const validateEnv = (): void => {
  console.log("🔍 Validating environment variables...");

  const criticalVars = ["DATABASE_URL", "ADMIN_PASSWORD", "JWT_SECRET"];

  // Each storage driver needs its own settings.
  if (config.isProduction) {
    criticalVars.push("PUBLIC_BASE_URL");
  } else {
    criticalVars.push("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
  }

  const missing = criticalVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((varName) => console.error(`   - ${varName}`));
    throw new Error("Environment validation failed");
  }

  if (config.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long");
  }

  const storage = config.isProduction ? "local-disk" : "supabase";
  console.log("✅ Environment variables validated");
  console.log(`📍 Environment: ${config.nodeEnv}`);
  console.log(`🚪 Port: ${config.port}`);
  console.log(`👤 Admin: ${config.adminUsername}`);
  console.log(`🗂️  Storage: ${storage}`);
  console.log(`⚡ Cache: ${config.redisUrl ? "redis" : "disabled (REDIS_URL not set)"}`);
  console.log(
    `📧 Email: ${
      config.smtp.enabled
        ? `${config.smtp.host}:${config.smtp.port} → inquiries to ${config.contactNotifyEmail}`
        : "disabled (set SMTP_HOST, SMTP_USER, SMTP_PASS)"
    }`
  );
  console.log(
    `📸 Instagram: ${
      config.instagramAccessToken ? "token set — renewed automatically" : "no token in .env (uses the stored one, if any)"
    }`
  );
};
