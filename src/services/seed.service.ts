import bcrypt from "bcrypt";
import prisma from "../config/database.config";
import { config } from "../config/env.config";

const SALT_ROUNDS = 10;

export class SeedService {
  /**
   * Ensure the default admin account exists. Idempotent — safe to run on every
   * boot. An existing admin is left untouched, so changing ADMIN_PASSWORD in the
   * env will not rotate a password that is already in the database; update it
   * through the app (or delete the row) instead.
   */
  static async runSeed(): Promise<void> {
    const existing = await prisma.user.findUnique({
      where: { username: config.adminUsername },
    });

    if (existing) {
      console.log(`👤 Admin "${config.adminUsername}" already exists — skipping seed`);
      return;
    }

    const passwordHash = await bcrypt.hash(config.adminPassword, SALT_ROUNDS);

    await prisma.user.create({
      data: {
        username: config.adminUsername,
        passwordHash,
        role: "admin",
      },
    });

    console.log(`✅ Admin user "${config.adminUsername}" created`);
  }
}
