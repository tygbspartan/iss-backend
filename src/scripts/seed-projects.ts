/**
 * Loads ISS's real event photos as Projects (the site's "Our Work" page).
 *
 * The photos and their titles live in prisma/seed-data/projects/ (projects.json
 * lists them, in the order they should appear on the site, first = top, each
 * with its event type; event-types.json lists the types in display order). Each
 * photo is uploaded through the normal StorageService — Supabase Storage in
 * development, the local /uploads folder in production — and a project is
 * created for it.
 *
 *   Development:  npm run seed:projects:dev [-- --replace]
 *   Production:   npm run build && npm run seed:projects [-- --replace]
 *
 * Safe to run more than once: event types and projects that already exist
 * are left as they are (so edits made in the admin are kept) — only a project
 * with no event type yet gets the one listed here — and photos aren't uploaded
 * again.
 *
 * --replace first deletes every project NOT in projects.json, along with its
 * images — use it to clear out sample/test projects.
 */
import { promises as fs } from "fs";
import path from "path";
import prisma, { disconnectDatabase } from "../config/database.config";
import { disconnectRedis, getRedisClient, isRedisReady } from "../config/redis.config";
import { CacheService } from "../services/cache.service";
import { StorageService } from "../services/storage.service";
import { uniqueSlug } from "../utils/slug.util";

const SEED_DIR = path.resolve(process.cwd(), "prisma/seed-data/projects");

interface SeedProject {
  title: string;
  slug: string;
  description: string;
  eventType: string; // an event type name from event-types.json
  image: string; // file name inside SEED_DIR
  services: string[]; // service slugs to link (unknown slugs are skipped)
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
  const list: SeedProject[] = JSON.parse(
    await fs.readFile(path.join(SEED_DIR, "projects.json"), "utf8")
  );
  const slugs = list.map((project) => project.slug);
  const typeNames: string[] = JSON.parse(await fs.readFile(path.join(SEED_DIR, "event-types.json"), "utf8"));
  const unknown = list.filter((project) => !typeNames.includes(project.eventType));
  if (unknown.length) throw new Error(`Unknown event type for: ${unknown.map((p) => p.title).join(", ")}`);

  if (replace) {
    const stale = await prisma.project.findMany({
      where: { slug: { notIn: slugs } },
      select: { id: true, title: true, image: true, thumbnails: true },
    });
    for (const project of stale) {
      await prisma.project.delete({ where: { id: project.id } });
      await StorageService.deleteImages([project.image, ...project.thumbnails]);
      console.log(`🗑️  Removed "${project.title}"`);
    }
  }

  // Event types: create the missing ones (in the listed order), keep the rest.
  const typeId = new Map<string, string>();
  for (const [index, name] of typeNames.entries()) {
    const type =
      (await prisma.eventType.findUnique({ where: { name } })) ??
      (await prisma.eventType.create({ data: { name, slug: await uniqueSlug("eventType", name), sortOrder: index } }));
    typeId.set(name, type.id);
  }

  const services = await prisma.service.findMany({ select: { id: true, slug: true } });
  const serviceId = new Map(services.map((service) => [service.slug, service.id]));

  // The site lists newest first, so the first entry gets the latest timestamp.
  const now = Date.now();
  let created = 0;
  let typed = 0;
  for (const [index, project] of list.entries()) {
    const existing = await prisma.project.findUnique({
      where: { slug: project.slug },
      select: { id: true, eventTypeId: true },
    });
    if (existing) {
      if (!existing.eventTypeId) {
        await prisma.project.update({ where: { id: existing.id }, data: { eventTypeId: typeId.get(project.eventType) } });
        typed++;
      }
      continue;
    }

    const buffer = await fs.readFile(path.join(SEED_DIR, project.image));
    const image = await StorageService.uploadImage(
      { buffer, mimetype: "image/jpeg", size: buffer.length } as Express.Multer.File,
      "projects"
    );
    try {
      await prisma.project.create({
        data: {
          title: project.title,
          slug: project.slug,
          description: project.description,
          image,
          eventTypeId: typeId.get(project.eventType),
          createdAt: new Date(now - index * 1000),
          services: {
            connect: project.services
              .filter((slug) => serviceId.has(slug))
              .map((slug) => ({ id: serviceId.get(slug)! })),
          },
        },
      });
    } catch (error) {
      await StorageService.deleteImage(image); // don't orphan the upload
      throw error;
    }
    created++;
    console.log(`✅ "${project.title}"`);
  }

  if (await redisReady()) {
    await CacheService.invalidate("projects", "services", "event-types");
  } else {
    console.warn("⚠️ Redis not reachable — cached project lists expire within 5 minutes.");
  }
  console.log(
    `\nDone: ${created} created, ${list.length - created} already there` +
      (typed ? `, ${typed} given an event type.` : ".")
  );
}

main()
  .catch((error) => {
    console.error("❌ Seeding projects failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectRedis().catch(() => undefined);
    await disconnectDatabase();
  });
