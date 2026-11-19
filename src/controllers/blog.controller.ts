import { Request, Response } from "express";
import prisma from "../config/database.config";
import { StorageService } from "../services/storage.service";
import { NotFoundError } from "../utils/customError.util";
import { sendSuccess } from "../utils/response.util";
import { uniqueSlug } from "../utils/slug.util";
import { getPagination, paginated } from "../utils/pagination.util";
import { createWithImage } from "./image.helper";

// Listing cards don't need the full body.
const LIST_SELECT = {
  id: true,
  title: true,
  slug: true,
  description: true,
  image: true,
  author: true,
  readTime: true,
  isPublished: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
};

// GET /blogs — public, published only. ?page=&limit=
export const listBlogs = async (req: Request, res: Response): Promise<void> => {
  const pagination = getPagination(req.query);
  const where = { isPublished: true };

  const [blogs, total] = await prisma.$transaction([
    prisma.blog.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { publishedAt: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.blog.count({ where }),
  ]);
  sendSuccess(res, paginated(blogs, total, pagination), "Blogs retrieved successfully");
};

// GET /blogs/slug/:slug — public, published only
export const getBlogBySlug = async (req: Request, res: Response): Promise<void> => {
  const blog = await prisma.blog.findFirst({
    where: { slug: req.params.slug as string, isPublished: true },
  });
  if (!blog) throw new NotFoundError("Blog not found");
  sendSuccess(res, blog, "Blog retrieved successfully");
};

// GET /blogs/admin/all — admin, includes drafts. ?page=&limit=
export const listAllBlogs = async (req: Request, res: Response): Promise<void> => {
  const pagination = getPagination(req.query);
  const [blogs, total] = await prisma.$transaction([
    prisma.blog.findMany({
      select: LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.blog.count(),
  ]);
  sendSuccess(res, paginated(blogs, total, pagination), "Blogs retrieved successfully");
};

// GET /blogs/:id — admin
export const getBlogById = async (req: Request, res: Response): Promise<void> => {
  const blog = await prisma.blog.findUnique({ where: { id: req.params.id as string } });
  if (!blog) throw new NotFoundError("Blog not found");
  sendSuccess(res, blog, "Blog retrieved successfully");
};

// POST /blogs — admin, multipart (fields + required "image" cover file)
export const createBlog = async (req: Request, res: Response): Promise<void> => {
  const { slug, ...data } = req.body;
  const finalSlug = slug ?? (await uniqueSlug("blog", data.title));

  const blog = await createWithImage(req, "blogs", (image) =>
    prisma.blog.create({
      data: {
        ...data,
        image,
        slug: finalSlug,
        publishedAt: data.isPublished ? new Date() : null,
      },
    })
  );
  sendSuccess(res, blog, "Blog created successfully", 201);
};

// PATCH /blogs/:id — admin. publishedAt is stamped the first time a post is
// published and kept if it's later unpublished and republished.
export const updateBlog = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const data = { ...req.body };

  if (data.isPublished) {
    const existing = await prisma.blog.findUnique({ where: { id }, select: { publishedAt: true } });
    if (!existing) throw new NotFoundError("Blog not found");
    if (!existing.publishedAt) data.publishedAt = new Date();
  }

  const blog = await prisma.blog.update({ where: { id }, data });
  sendSuccess(res, blog, "Blog updated successfully");
};

// DELETE /blogs/:id — admin
export const deleteBlog = async (req: Request, res: Response): Promise<void> => {
  const blog = await prisma.blog.delete({ where: { id: req.params.id as string } });
  await StorageService.deleteImage(blog.image);
  sendSuccess(res, null, "Blog deleted successfully");
};
