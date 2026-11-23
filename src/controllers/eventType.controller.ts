import { Request, Response } from "express";
import prisma from "../config/database.config";
import { BadRequestError, NotFoundError } from "../utils/customError.util";
import { sendSuccess } from "../utils/response.util";
import { uniqueSlug } from "../utils/slug.util";

const ORDER = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

// Names are unique regardless of capitalisation ("Concerts" vs "concerts"),
// which the database's plain unique index wouldn't catch.
const assertNameFree = async (name: string, exceptId?: string): Promise<void> => {
  const clash = await prisma.eventType.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true },
  });
  if (clash) {
    throw new BadRequestError("Validation failed", { name: ["An event type with this name already exists"] });
  }
};

// GET /event-types — public, in display order, with how many visible projects
// each has (the Projects page only offers types that have some).
export const listEventTypes = async (_req: Request, res: Response): Promise<void> => {
  const types = await prisma.eventType.findMany({
    orderBy: ORDER,
    select: {
      id: true,
      name: true,
      slug: true,
      sortOrder: true,
      _count: { select: { projects: { where: { isActive: true } } } },
    },
  });
  sendSuccess(res, types, "Event types retrieved successfully");
};

// GET /event-types/admin/all — admin, with how many projects each has (hidden ones too)
export const listAllEventTypes = async (_req: Request, res: Response): Promise<void> => {
  const types = await prisma.eventType.findMany({
    orderBy: ORDER,
    include: { _count: { select: { projects: true } } },
  });
  sendSuccess(res, types, "Event types retrieved successfully");
};

// POST /event-types — admin
export const createEventType = async (req: Request, res: Response): Promise<void> => {
  const { slug, ...data } = req.body;
  await assertNameFree(data.name);
  const type = await prisma.eventType.create({
    data: { ...data, slug: slug ?? (await uniqueSlug("eventType", data.name)) },
    include: { _count: { select: { projects: true } } },
  });
  sendSuccess(res, type, "Event type created successfully", 201);
};

// PATCH /event-types/:id — admin
export const updateEventType = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  if (req.body.name) await assertNameFree(req.body.name, id);
  const type = await prisma.eventType.update({
    where: { id },
    data: req.body,
    include: { _count: { select: { projects: true } } },
  });
  sendSuccess(res, type, "Event type updated successfully");
};

// DELETE /event-types/:id — admin. Its projects stay, just without a type.
export const deleteEventType = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const exists = await prisma.eventType.count({ where: { id } });
  if (!exists) throw new NotFoundError("Event type not found");
  await prisma.eventType.delete({ where: { id } });
  sendSuccess(res, null, "Event type deleted successfully");
};
