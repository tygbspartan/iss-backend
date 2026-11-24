/**
 * Loads ISS's staff as Team members, grouped into departments (the Teams page).
 *
 * The data lives in prisma/seed-data/team/:
 *   team.json     departments in display order, each with its members in order
 *                 (name, job title, real photo file and cartoon file — either
 *                 can be null when there isn't one yet)
 *   *.jpg         the photos and cartoons, plus no-photo.jpg for people
 *                 without a photo
 *   phones.json   { "<name>": "+977 98…" } — staff phone numbers. NOT in git
 *                 (the repo is public): copy it to the server by hand. Without
 *                 it members are created without numbers; run the script again
 *                 once it's there and the missing numbers are filled in.
 *
 * Each image is uploaded through the normal StorageService — Supabase Storage
 * in development, the local /uploads folder in production. The cartoon is
 * shown by default and the real photo on hover/tap. Someone without a cartoon
 * gets their real photo in its place (uploaded as its own file, so replacing
 * one in the admin doesn't delete the other); someone with neither gets the
 * no-photo placeholder for both.
 *
 *   Development:  npm run seed:team:dev [-- --replace]
 *   Production:   npm run build && npm run seed:team [-- --replace]
 *
 * Safe to run more than once: departments and members that already exist (by
 * name) are left as they are — only a missing phone number is filled in.
 *
 * --replace first deletes every member NOT in team.json (with their photos),
 * then every department left with no members — use it to clear out samples.
 */
import { promises as fs } from "fs";
import path from "path";
import prisma, { disconnectDatabase } from "../config/database.config";
import { disconnectRedis, getRedisClient, isRedisReady } from "../config/redis.config";
import { CacheService } from "../services/cache.service";
import { StorageService } from "../services/storage.service";

const SEED_DIR = path.resolve(process.cwd(), "prisma/seed-data/team");
const NO_PHOTO = "no-photo.jpg";

interface SeedDepartment {
  department: string;
  isCore: boolean; // shown with the About page's "core" people
  members: { name: string; jobTitle: string; photo: string | null; cartoon: string | null }[];
}

const readJson = async <T>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(path.join(SEED_DIR, file), "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const upload = async (file: string): Promise<string> => {
  const buffer = await fs.readFile(path.join(SEED_DIR, file));
  return StorageService.uploadImage(
    { buffer, mimetype: "image/jpeg", size: buffer.length } as Express.Multer.File,
    "team"
  );
};

// Wait briefly for Redis so the cache can be cleared; carry on without it.
const redisReady = async (timeoutMs = 5000): Promise<boolean> => {
  if (!getRedisClient()) return false;
  const start = Date.now();
  while (!isRedisReady() && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return isRedisReady();
};

async function main(): Promise<void> {
  const replace = process.argv.includes("--replace");
  const team = await readJson<SeedDepartment[]>("team.json");
  if (!team) throw new Error(`Missing ${path.join(SEED_DIR, "team.json")}`);
  const phones = (await readJson<Record<string, string>>("phones.json")) ?? {};
  if (Object.keys(phones).length === 0) {
    console.warn("⚠️ No phones.json — members are created without phone numbers.");
  }

  const names = team.flatMap((d) => d.members.map((m) => m.name));
  if (new Set(names).size !== names.length) throw new Error("team.json lists a name twice");

  if (replace) {
    const stale = await prisma.teamMember.findMany({
      where: { name: { notIn: names } },
      select: { id: true, name: true, image: true, actualImage: true },
    });
    for (const member of stale) {
      await prisma.teamMember.delete({ where: { id: member.id } });
      await StorageService.deleteImages([member.image, member.actualImage].filter((u): u is string => !!u));
      console.log(`🗑️  Removed member "${member.name}"`);
    }
    const emptyDepartments = await prisma.department.findMany({
      where: { members: { none: {} }, name: { notIn: team.map((d) => d.department) } },
      select: { id: true, name: true },
    });
    for (const department of emptyDepartments) {
      await prisma.department.delete({ where: { id: department.id } });
      console.log(`🗑️  Removed department "${department.name}"`);
    }
  }

  let created = 0;
  let phonesFilled = 0;
  for (const [deptIndex, seed] of team.entries()) {
    const department =
      (await prisma.department.findUnique({ where: { name: seed.department } })) ??
      (await prisma.department.create({
        data: { name: seed.department, sortOrder: deptIndex, isCore: seed.isCore },
      }));

    for (const [index, member] of seed.members.entries()) {
      const phone = phones[member.name] ?? null;
      const existing = await prisma.teamMember.findFirst({
        where: { name: member.name },
        select: { id: true, phone: true },
      });
      if (existing) {
        if (!existing.phone && phone) {
          await prisma.teamMember.update({ where: { id: existing.id }, data: { phone } });
          phonesFilled++;
        }
        continue;
      }

      const photo = member.photo ?? NO_PHOTO;
      const image = await upload(member.cartoon ?? photo);
      const actualImage = await upload(photo);
      try {
        await prisma.teamMember.create({
          data: {
            name: member.name,
            jobTitle: member.jobTitle,
            phone,
            image,
            actualImage,
            departmentId: department.id,
            sortOrder: index,
          },
        });
      } catch (error) {
        await StorageService.deleteImages([image, actualImage]); // don't orphan the uploads
        throw error;
      }
      created++;
      console.log(
        `✅ ${seed.department}: ${member.name}` +
          (!member.photo ? " (no photo yet)" : !member.cartoon ? " (no cartoon yet)" : "")
      );
    }
  }

  if (await redisReady()) {
    await CacheService.invalidate("team");
  } else {
    console.warn("⚠️ Redis not reachable — the cached team list expires within 5 minutes.");
  }
  console.log(
    `\nDone: ${created} created, ${names.length - created} already there` +
      (phonesFilled ? `, ${phonesFilled} phone numbers filled in.` : ".")
  );
}

main()
  .catch((error) => {
    console.error("❌ Seeding the team failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectRedis().catch(() => undefined);
    await disconnectDatabase();
  });
