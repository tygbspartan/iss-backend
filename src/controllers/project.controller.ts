import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../config/database.config";
import { StorageService } from "../services/storage.service";
import { BadRequestError, NotFoundError } from "../utils/customError.util";
import { sendSuccess } from "../utils/response.util";
import { uniqueSlug } from "../utils/slug.util";
import { assertAllExist, toConnect } from "../utils/relations.util";
import { getPagination, paginated } from "../utils/pagination.util";
import { createWithImage } from "./image.helper";

const MAX_THUMBNAILS = 30;
const SERVICE_SUMMARY = { id: true, title: true, slug: true };

// GET /projects — public, active only. ?service=<slug> filters; ?page=&limit=
export const listProjects = async (req: Request, res: Response): Promise<void> => {
  const pagination = getPagination(req.query);
  const serviceSlug = typeof req.query.service === "string" ? req.query.service : undefined;

  const where: Prisma.ProjectWhereInput = {
    isActive: true,
    ...(serviceSlug && { services: { some: { slug: serviceSlug, isActive: true } } }),
  };

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
      include: { services: { where: { isActive: true }, select: SERVICE_SUMMARY } },
    }),
    prisma.project.count({ where }),
  ]);
  sendSuccess(res, paginated(projects, total, pagination), "Projects retrieved successfully");
};

// GET /projects/slug/:slug — public
export const getProjectBySlug = async (req: Request, res: Response): Promise<void> => {
  const project = await prisma.project.findFirst({
    where: { slug: req.params.slug as string, isActive: true },
    include: { services: { where: { isActive: true }, select: SERVICE_SUMMARY } },
  });
  if (!project) throw new NotFoundError("Project not found");
  sendSuccess(res, project, "Project retrieved successfully");
};

// GET /projects/admin/all — admin, includes inactive. ?page=&limit=
export const listAllProjects = async (req: Request, res: Response): Promise<void> => {
  const pagination = getPagination(req.query);
  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
      include: { services: { select: SERVICE_SUMMARY } },
    }),
    prisma.project.count(),
  ]);
  sendSuccess(res, paginated(projects, total, pagination), "Projects retrieved successfully");
};

// GET /projects/:id — admin
export const getProjectById = async (req: Request, res: Response): Promise<void> => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id as string },
    include: { services: { select: SERVICE_SUMMARY } },
  });
  if (!project) throw new NotFoundError("Project not found");
  sendSuccess(res, project, "Project retrieved successfully");
};

// POST /projects — admin, multipart (fields + required "image" cover file).
// At least one service is required (enforced by the validator).
export const createProject = async (req: Request, res: Response): Promise<void> => {
  const { serviceIds, slug, ...data } = req.body;
  await assertAllExist("service", serviceIds, "services");
  const finalSlug = slug ?? (await uniqueSlug("project", data.title));

  const project = await createWithImage(req, "projects", (image) =>
    prisma.project.create({
      data: {
        ...data,
        image,
        slug: finalSlug,
        services: { connect: toConnect(serviceIds) },
      },
      include: { services: { select: SERVICE_SUMMARY } },
    })
  );
  sendSuccess(res, project, "Project created successfully", 201);
};

// PATCH /projects/:id — admin. `serviceIds`, when sent, replaces the full set.
// `thumbnails`, when sent, is the gallery to keep in display order; anything
// left out is deleted from storage.
export const updateProject = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { serviceIds, thumbnails, ...data } = req.body;
  if (serviceIds) await assertAllExist("service", serviceIds, "services");

  let removedThumbnails: string[] = [];
  if (thumbnails) {
    const existing = await prisma.project.findUnique({ where: { id }, select: { thumbnails: true } });
    if (!existing) throw new NotFoundError("Project not found");

    const current = new Set(existing.thumbnails);
    if (thumbnails.some((url: string) => !current.has(url))) {
      throw new BadRequestError(
        "thumbnails may only reorder or remove existing images; upload new ones via POST /projects/:id/thumbnails"
      );
    }
    const keep = new Set<string>(thumbnails);
    removedThumbnails = existing.thumbnails.filter((url) => !keep.has(url));
  }

  const project = await prisma.project.update({
    where: { id },
    data: {
      ...data,
      ...(thumbnails && { thumbnails: [...new Set(thumbnails as string[])] }),
      ...(serviceIds && { services: { set: toConnect(serviceIds) } }),
    },
    include: { services: { select: SERVICE_SUMMARY } },
  });

  if (removedThumbnails.length) await StorageService.deleteImages(removedThumbnails);
  sendSuccess(res, project, "Project updated successfully");
};

// POST /projects/:id/thumbnails — admin, multipart field "thumbnails" (up to 10
// per request). Appends to the end of the gallery.
export const addThumbnails = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    throw new BadRequestError('At least one image is required (field name "thumbnails")');
  }

  const existing = await prisma.project.findUnique({ where: { id }, select: { thumbnails: true } });
  if (!existing) throw new NotFoundError("Project not found");
  if (existing.thumbnails.length + files.length > MAX_THUMBNAILS) {
    throw new BadRequestError(`A project can have at most ${MAX_THUMBNAILS} thumbnail images`);
  }

  const urls = await Promise.all(files.map((file) => StorageService.uploadImage(file, "projects")));

  let project;
  try {
    // `push` appends atomically, so concurrent uploads don't overwrite each other.
    project = await prisma.project.update({
      where: { id },
      data: { thumbnails: { push: urls } },
    });
  } catch (error) {
    await StorageService.deleteImages(urls);
    throw error;
  }
  sendSuccess(res, project, "Thumbnails uploaded successfully");
};

// DELETE /projects/:id — admin. Removes the cover image and gallery from storage.
export const deleteProject = async (req: Request, res: Response): Promise<void> => {
  const project = await prisma.project.delete({ where: { id: req.params.id as string } });
  await StorageService.deleteImages([project.image, ...project.thumbnails]);
  sendSuccess(res, null, "Project deleted successfully");
};
