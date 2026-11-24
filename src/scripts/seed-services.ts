/**
 * Loads ISS's services (the Services pages and the home page's service list).
 *
 * The data lives in prisma/seed-data/services/: services.json lists them in
 * display order (title, slug, description, "What's Included" features, image
 * file), next to their images. Each image is uploaded through the normal
 * StorageService — Supabase Storage in development, the local /uploads folder
 * in production — and a service is created for it.
 *
 *   Development:  npm run seed:services:dev [-- --replace]
 *   Production:   npm run build && npm run seed:services [-- --replace]
 *
 * Run it before seed:projects if projects are to be linked to services.
 *
 * Safe to run more than once: a service whose slug already exists is left
 * exactly as it is (so edits made in the admin are kept), and its image isn't
 * uploaded again.
 *
 * --replace first deletes every service NOT in services.json, along with its
 * image — use it to clear out sample/test services. (Projects linked to a
 * deleted service just lose that link.)
 */
import { promises as fs } from "fs";
import path from "path";
import prisma, { disconnectDatabase } from "../config/database.config";
import { disconnectRedis, getRedisClient, isRedisReady } from "../config/redis.config";
import { CacheService } from "../services/cache.service";
import { StorageService } from "../services/storage.service";

const SEED_DIR = path.resolve(process.cwd(), "prisma/seed-data/services");

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

interface SeedService {
  title: string;
  slug: string;
  description: string;
  features: string[];
  image: string; // file name inside SEED_DIR
}

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
  const list: SeedService[] = JSON.parse(
    await fs.readFile(path.join(SEED_DIR, "services.json"), "utf8")
  );
  const slugs = list.map((service) => service.slug);

  if (replace) {
    const stale = await prisma.service.findMany({
      where: { slug: { notIn: slugs } },
      select: { id: true, title: true, image: true },
    });
    for (const service of stale) {
      await prisma.service.delete({ where: { id: service.id } });
      await StorageService.deleteImage(service.image);
      console.log(`🗑️  Removed "${service.title}"`);
    }
  }

  let created = 0;
  for (const [index, service] of list.entries()) {
    if (await prisma.service.findUnique({ where: { slug: service.slug }, select: { id: true } })) {
      console.log(`⏭️  "${service.title}" already exists — left as is`);
      continue;
    }

    const mimetype = MIME_BY_EXT[path.extname(service.image).toLowerCase()];
    if (!mimetype) throw new Error(`Unsupported image type: ${service.image}`);
    const buffer = await fs.readFile(path.join(SEED_DIR, service.image));
    const image = await StorageService.uploadImage(
      { buffer, mimetype, size: buffer.length } as Express.Multer.File,
      "services"
    );
    try {
      await prisma.service.create({
        data: {
          title: service.title,
          slug: service.slug,
          description: service.description,
          features: service.features,
          image,
          sortOrder: index,
        },
      });
    } catch (error) {
      await StorageService.deleteImage(image); // don't orphan the upload
      throw error;
    }
    created++;
    console.log(`✅ "${service.title}"`);
  }

  if (await redisReady()) {
    await CacheService.invalidate("services", "projects");
  } else {
    console.warn("⚠️ Redis not reachable — cached service lists expire within 5 minutes.");
  }
  console.log(`\nDone: ${created} created, ${list.length - created} already there.`);
}

main()
  .catch((error) => {
    console.error("❌ Seeding services failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectRedis().catch(() => undefined);
    await disconnectDatabase();
  });
