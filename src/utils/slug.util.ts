import prisma from "../config/database.config";

type SluggedModel = "service" | "project" | "blog" | "eventType";

// URL-friendly slug: "Live Sound & PA Rental!" → "live-sound-pa-rental"
export const generateSlug = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/[\s_-]+/g, "-") // Spaces/underscores → hyphens
    .replace(/^-+|-+$/g, ""); // Trim leading/trailing hyphens

/**
 * Slug derived from `text`, suffixed (-1, -2, …) until it's free in `model`.
 * Used when the admin doesn't supply a slug; an explicit slug that collides is
 * left to the unique constraint (→ 409) instead of being silently renamed.
 */
export const uniqueSlug = async (
  model: SluggedModel,
  text: string
): Promise<string> => {
  const base = generateSlug(text) || "item";

  const taken = await (prisma[model] as any).findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const takenSet = new Set<string>(taken.map((row: { slug: string }) => row.slug));

  let slug = base;
  for (let i = 1; takenSet.has(slug); i++) {
    slug = `${base}-${i}`;
  }
  return slug;
};
