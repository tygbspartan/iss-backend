import dotenv from "dotenv";

dotenv.config();

interface EnvConfig {
  // Server
  port: number;
  nodeEnv: string;
  clientUrl: string;

  // Database
  databaseUrl: string;

  // Default admin account (seeded on startup)
  adminUsername: string;
  adminPassword: string;
}

const getEnvVariable = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;
  if (!value && !defaultValue) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value as string;
};

export const config: EnvConfig = {
  // Server
  port: parseInt(getEnvVariable("PORT", "5000")),
  nodeEnv: getEnvVariable("NODE_ENV", "development"),
  clientUrl: getEnvVariable("CLIENT_URL", "http://localhost:3000"),

  // Database
  databaseUrl: getEnvVariable("DATABASE_URL"),

  // Default admin account
  adminUsername: getEnvVariable("ADMIN_USERNAME", "admin"),
  adminPassword: getEnvVariable("ADMIN_PASSWORD"),
};

// Validate critical env variables on startup
export const validateEnv = (): void => {
  console.log("🔍 Validating environment variables...");

  const criticalVars = ["DATABASE_URL", "ADMIN_PASSWORD"];

  const missing = criticalVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((varName) => console.error(`   - ${varName}`));
    throw new Error("Environment validation failed");
  }

  console.log("✅ Environment variables validated");
  console.log(`📍 Environment: ${config.nodeEnv}`);
  console.log(`🚪 Port: ${config.port}`);
  console.log(`👤 Admin: ${config.adminUsername}`);
};
