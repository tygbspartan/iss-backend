import { z } from "zod";

// Every resource requires an image, so CREATE is sent as multipart/form-data:
// the fields plus the "image" file in one request (a record can never exist
// without its image). Multipart values all arrive as strings, so create
// schemas coerce numbers/booleans/arrays. UPDATE is plain JSON; images are
// replaced through POST /:id/image (and can't be removed).
//
// Update schemas are `.partial()`: a field may be omitted, but if sent it must
// still be valid — so required fields can't be blanked out by an update.

// Multipart bodies turn every "\n" into "\r\n" (per the HTML spec), so line
// endings are normalised — otherwise text saved via create and via update
// (JSON) would differ.
export const requiredText = (label: string, max: number) =>
  z
    .string({ error: `${label} is required` })
    .transform((s) => s.replace(/\r\n?/g, "\n").trim())
    .pipe(z.string().min(1, `${label} is required`).max(max));

const slugRule = z
  .string()
  .trim()
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may only contain lowercase letters, numbers and hyphens");

// ── Multipart coercion helpers ("" means "not given") ──────────────────────
const blank = (v: unknown) => (v === "" ? undefined : v);
const formOptional = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional());
const formInt = formOptional(z.coerce.number().int().min(0));
const formBool = formOptional(z.enum(["true", "false"]).transform((v) => v === "true"));
// Repeated form keys arrive as an array, a single one as a plain string.
const formUuidArray = z.preprocess(
  (v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.uuid()).max(500)
);

// ── JSON (update) helpers ──────────────────────────────────────────────────
const sortOrder = z.number().int().min(0).optional();
const isActive = z.boolean().optional();

// ── Services ────────────────────────────────────────────────────────────────
// Required: title, description, image. Optional: slug, order, visibility,
// projects, and the "what's included" list (one short line per item).
const serviceFields = {
  title: requiredText("Title", 200),
  description: requiredText("Description", 10000),
};
const featureList = z.array(requiredText("Each item", 200)).max(50, "At most 50 items");
export const createServiceSchema = z.object({
  ...serviceFields,
  slug: formOptional(slugRule),
  sortOrder: formInt,
  isActive: formBool,
  projectIds: formUuidArray.optional(),
  // Repeated form keys arrive as an array, a single one as a plain string.
  features: z.preprocess((v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]), featureList),
});
export const updateServiceSchema = z
  .object({
    ...serviceFields,
    slug: slugRule,
    sortOrder,
    isActive,
    projectIds: z.array(z.uuid()).max(500),
    features: featureList,
  })
  .partial();

// ── Projects ────────────────────────────────────────────────────────────────
// Required: title, description, cover image. Services and the event type are
// optional (an event type groups projects on the Projects page).
const projectFields = {
  title: requiredText("Title", 200),
  description: requiredText("Description", 10000),
};
export const createProjectSchema = z.object({
  ...projectFields,
  slug: formOptional(slugRule),
  isActive: formBool,
  serviceIds: formUuidArray,
  eventTypeId: formOptional(z.uuid("Please choose an event type")),
});
export const updateProjectSchema = z
  .object({
    ...projectFields,
    slug: slugRule,
    isActive,
    serviceIds: z.array(z.uuid()).max(500),
    // null clears it.
    eventTypeId: z.uuid("Please choose an event type").nullable(),
    // Reorder / remove gallery images: send the URLs to keep, in display order.
    // Any existing URL left out is deleted from storage. New images are added
    // via POST /projects/:id/thumbnails.
    thumbnails: z.array(z.string()).max(100),
  })
  .partial();

// ── Team ────────────────────────────────────────────────────────────────────
// Required: everything except link and phone (photo included). The department is picked
// from the departments list, not typed.
// A phone number as people write it: digits with optional +, spaces, dashes
// or brackets ("+977 9802375115", "984-9273916").
const phoneNumber = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 ()-]{5,22}$/, "Enter a valid phone number");

const teamFields = {
  name: requiredText("Name", 150),
  jobTitle: requiredText("Job title", 150),
  departmentId: z.uuid("Please choose a department"),
};
export const createTeamMemberSchema = z.object({
  ...teamFields,
  link: formOptional(z.url().max(500)),
  phone: formOptional(phoneNumber),
  sortOrder: formInt,
  isActive: formBool,
});
export const updateTeamMemberSchema = z
  .object({
    ...teamFields,
    link: z.url().max(500).nullable(),
    // Blank clears it.
    phone: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), phoneNumber.nullable()),
    sortOrder,
    isActive,
  })
  .partial();

// ── Event types ─────────────────────────────────────────────────────────────
// Plain JSON (no image). Required: name. The slug (used in the Projects page
// filter's address) is made from the name when left out.
const eventTypeFields = {
  name: requiredText("Event type name", 100),
  sortOrder,
};
export const createEventTypeSchema = z.object({ ...eventTypeFields, slug: slugRule.optional() });
export const updateEventTypeSchema = z.object({ ...eventTypeFields, slug: slugRule }).partial();

// ── Departments ─────────────────────────────────────────────────────────────
// Plain JSON (no image). Required: name. isCore = its members are the "core
// people" shown on the About page.
const departmentFields = {
  name: requiredText("Department name", 100),
  sortOrder,
  isCore: z.boolean().optional(),
};
export const createDepartmentSchema = z.object(departmentFields);
export const updateDepartmentSchema = z.object(departmentFields).partial();

// ── Blogs ───────────────────────────────────────────────────────────────────
// Required: title, excerpt (description), content (Markdown), cover image.
// Optional: author (default "ISS Nepal") and read time in minutes (default 5).
export const DEFAULT_BLOG_AUTHOR = "ISS Nepal";
export const DEFAULT_BLOG_READ_TIME = 5;

const blogFields = {
  title: requiredText("Title", 250),
  description: requiredText("Excerpt", 1000),
  content: requiredText("Content", 100000),
};
// Left blank → back to the default, on create and on update alike.
const blogAuthor = z
  .string()
  .trim()
  .max(100)
  .transform((v) => v || DEFAULT_BLOG_AUTHOR);
const readTimeRule = z.coerce
  .number({ error: "Read time must be a number" })
  .int("Read time must be a whole number of minutes")
  .min(1, "Read time must be at least 1 minute")
  .max(240, "Read time must be at most 240 minutes");

export const createBlogSchema = z.object({
  ...blogFields,
  slug: formOptional(slugRule),
  isPublished: formBool,
  author: blogAuthor.optional(),
  readTime: formOptional(readTimeRule),
});
export const updateBlogSchema = z
  .object({
    ...blogFields,
    slug: slugRule,
    isPublished: z.boolean(),
    author: blogAuthor,
    // null / "" on update means "reset to the default".
    readTime: z.preprocess((v) => (v === null || v === "" ? DEFAULT_BLOG_READ_TIME : v), readTimeRule),
  })
  .partial();

// ── Testimonials ────────────────────────────────────────────────────────────
// Required: client name, company, testimony, photo.
const testimonialFields = {
  clientName: requiredText("Client name", 150),
  companyName: requiredText("Company", 200),
  testimony: requiredText("Testimony", 5000),
};
export const createTestimonialSchema = z.object({
  ...testimonialFields,
  sortOrder: formInt,
  isActive: formBool,
});
export const updateTestimonialSchema = z
  .object({ ...testimonialFields, sortOrder, isActive })
  .partial();

// ── Clients ─────────────────────────────────────────────────────────────────
// Required: company name, logo.
const clientFields = {
  companyName: requiredText("Company name", 200),
};
export const createClientSchema = z.object({
  ...clientFields,
  sortOrder: formInt,
  isActive: formBool,
});
export const updateClientSchema = z.object({ ...clientFields, sortOrder, isActive }).partial();
