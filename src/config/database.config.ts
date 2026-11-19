import { PrismaClient } from "@prisma/client";
import { config } from "./env.config";

// By default Prisma's query engine starts one thread per CPU core and opens
// (cores × 2 + 1) database connections. On a shared host with dozens of cores
// that's dozens of threads (each counted against cPanel's process limit) and
// far more connections than this site needs. Cap both unless set already.
process.env.TOKIO_WORKER_THREADS ??= "2";

const withConnectionLimit = (url: string | undefined): string | undefined => {
  if (!url || /[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=5`;
};

const prisma = new PrismaClient({ datasourceUrl: withConnectionLimit(config.databaseUrl) });

export const testDatabaseConnection = async (): Promise<boolean> => {
  try {
    await prisma.$connect();
    // $connect() can succeed lazily, so issue a real query to be sure the
    // credentials and database actually work.
    await prisma.$queryRaw`SELECT 1`;
    console.log("✅ Database connected successfully");
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
};

export default prisma;
