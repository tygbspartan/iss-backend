import { Request, Response } from "express";
import prisma from "../config/database.config";
import { StorageService } from "../services/storage.service";
import { NotFoundError } from "../utils/customError.util";
import { sendSuccess } from "../utils/response.util";
import { uniqueSlug } from "../utils/slug.util";
import { assertAllExist, assertProjectsKeepAService, toConnect } from "../utils/relations.util";
import { createWithImage } from "./image.helper";

const ORDER = [{ sortOrder: "asc" as const }, { createdAt: "desc" as const }];
const PROJECT_SUMMARY = { id: true, title: true, slug: true, image: true };

// GET /services — public, active only
export const listServices = async (_req: Request, res: Response): Promise<void> => {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: ORDER,
  });
  sendSuccess(res, services, "Services retrieved successfully");
};

// GET /services/slug/:slug — public, with its active projects
export const getServiceBySlug = async (req: Request, res: Response): Promise<void> => {
  const service = await prisma.service.findFirst({
    where: { slug: req.params.slug as string, isActive: true },
    include: {
      projects: {
        where: { isActive: true },
        select: PROJECT_SUMMARY,
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!service) throw new NotFoundError("Service not found");
  sendSuccess(res, service, "Service retrieved successfully");
};

// GET /services/admin/all — admin, includes inactive
export const listAllServices = async (_req: Request, res: Response): Promise<void> => {
  const services = await prisma.service.findMany({
    orderBy: ORDER,
    include: { _count: { select: { projects: true } } },
  });
  sendSuccess(res, services, "Services retrieved successfully");
};

// GET /services/:id — admin
export const getServiceById = async (req: Request, res: Response): Promise<void> => {
  const service = await prisma.service.findUnique({
    where: { id: req.params.id as string },
    include: { projects: { select: PROJECT_SUMMARY, orderBy: { createdAt: "desc" } } },
  });
  if (!service) throw new NotFoundError("Service not found");
  sendSuccess(res, service, "Service retrieved successfully");
};

// POST /services — admin, multipart (fields + required "image" file)
export const createService = async (req: Request, res: Response): Promise<void> => {
  const { projectIds, slug, ...data } = req.body;
  if (projectIds?.length) await assertAllExist("project", projectIds, "projects");
  const finalSlug = slug ?? (await uniqueSlug("service", data.title));

  const service = await createWithImage(req, "services", (image) =>
    prisma.service.create({
      data: {
        ...data,
        image,
        slug: finalSlug,
        ...(projectIds?.length && { projects: { connect: toConnect(projectIds) } }),
      },
      include: { projects: { select: PROJECT_SUMMARY } },
    })
  );
  sendSuccess(res, service, "Service created successfully", 201);
};

// PATCH /services/:id — admin. `projectIds`, when sent, replaces the full set.
export const updateService = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { projectIds, ...data } = req.body;
  if (projectIds) {
    await assertAllExist("project", projectIds, "projects");
    // Projects being unlinked must still have another service.
    const current = await prisma.project.findMany({
      where: { services: { some: { id } } },
      select: { id: true },
    });
    const keep = new Set<string>(projectIds);
    const removed = current.map((p) => p.id).filter((pid) => !keep.has(pid));
    if (removed.length) await assertProjectsKeepAService(id, removed);
  }

  const service = await prisma.service.update({
    where: { id },
    data: {
      ...data,
      ...(projectIds && { projects: { set: toConnect(projectIds) } }),
    },
    include: { projects: { select: PROJECT_SUMMARY } },
  });
  sendSuccess(res, service, "Service updated successfully");
};

// DELETE /services/:id — admin. Projects are only unlinked, not deleted —
// refused if that would leave a project with no service.
export const deleteService = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  await assertProjectsKeepAService(id);
  const service = await prisma.service.delete({ where: { id } });
  await StorageService.deleteImage(service.image);
  sendSuccess(res, null, "Service deleted successfully");
};
