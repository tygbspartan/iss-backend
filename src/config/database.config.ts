import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
