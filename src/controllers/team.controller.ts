import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../config/database.config";
import { StorageService } from "../services/storage.service";
import { BadRequestError, NotFoundError } from "../utils/customError.util";
import { sendSuccess } from "../utils/response.util";

// Every member is returned with its department, so pages can group by it.
const WITH_DEPARTMENT = {
  department: { select: { id: true, name: true, sortOrder: true, isCore: true } },
} satisfies Prisma.TeamMemberInclude;

// Departments in their display order, then members in theirs (ties: by name).
const ORDER: Prisma.TeamMemberOrderByWithRelationInput[] = [
  { department: { sortOrder: "asc" } },
  { department: { name: "asc" } },
  { sortOrder: "asc" },
  { name: "asc" },
];

const assertDepartmentExists = async (departmentId: string): Promise<void> => {
  const exists = await prisma.department.count({ where: { id: departmentId } });
  if (!exists) {
    throw new BadRequestError("Validation failed", { departmentId: ["Please choose a department"] });
  }
};

// GET /team — public, visible members only.
// ?core=true → only members of "core" departments (the About page).
export const listTeam = async (req: Request, res: Response): Promise<void> => {
  const coreOnly = req.query.core === "true";
  const members = await prisma.teamMember.findMany({
    where: { isActive: true, ...(coreOnly && { department: { isCore: true } }) },
    include: WITH_DEPARTMENT,
    orderBy: ORDER,
  });
  sendSuccess(res, members, "Team members retrieved successfully");
};

// GET /team/admin/all — admin, includes hidden members
export const listAllTeam = async (_req: Request, res: Response): Promise<void> => {
  const members = await prisma.teamMember.findMany({ include: WITH_DEPARTMENT, orderBy: ORDER });
  sendSuccess(res, members, "Team members retrieved successfully");
};

// GET /team/:id — admin
export const getTeamMember = async (req: Request, res: Response): Promise<void> => {
  const member = await prisma.teamMember.findUnique({
    where: { id: req.params.id as string },
    include: WITH_DEPARTMENT,
  });
  if (!member) throw new NotFoundError("Team member not found");
  sendSuccess(res, member, "Team member retrieved successfully");
};

// POST /team — admin, multipart: the fields plus two required files,
// "image" (cartoon, shown by default) and "actualImage" (real photo, on hover).
export const createTeamMember = async (req: Request, res: Response): Promise<void> => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const cartoon = files?.image?.[0];
  const actual = files?.actualImage?.[0];
  if (!cartoon || !actual) {
    throw new BadRequestError("Validation failed", {
      ...(!cartoon && { image: ["Cartoon image is required"] }),
      ...(!actual && { actualImage: ["Actual photo is required"] }),
    });
  }
  await assertDepartmentExists(req.body.departmentId);

  const [image, actualImage] = await Promise.all([
    StorageService.uploadImage(cartoon, "team"),
    StorageService.uploadImage(actual, "team"),
  ]);
  try {
    const member = await prisma.teamMember.create({
      data: { ...req.body, image, actualImage },
      include: WITH_DEPARTMENT,
    });
    sendSuccess(res, member, "Team member created successfully", 201);
  } catch (error) {
    await StorageService.deleteImages([image, actualImage]); // don't orphan the uploads
    throw error;
  }
};

// POST /team/:id/actual-image — admin, multipart field "actualImage".
// Sets or replaces the real photo. (The cartoon uses POST /:id/image.)
export const replaceActualImage = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  if (!req.file) throw new BadRequestError('Photo file is required (field name "actualImage")');

  const existing = await prisma.teamMember.findUnique({ where: { id }, select: { actualImage: true } });
  if (!existing) throw new NotFoundError("Team member not found");

  const actualImage = await StorageService.uploadImage(req.file, "team");
  let member;
  try {
    member = await prisma.teamMember.update({ where: { id }, data: { actualImage }, include: WITH_DEPARTMENT });
  } catch (error) {
    await StorageService.deleteImage(actualImage);
    throw error;
  }
  // Only remove the old file once the record points at the new one.
  if (existing.actualImage) await StorageService.deleteImage(existing.actualImage);
  sendSuccess(res, member, "Actual photo uploaded successfully");
};

// PATCH /team/:id — admin
export const updateTeamMember = async (req: Request, res: Response): Promise<void> => {
  if (req.body.departmentId) await assertDepartmentExists(req.body.departmentId);
  const member = await prisma.teamMember.update({
    where: { id: req.params.id as string },
    data: req.body,
    include: WITH_DEPARTMENT,
  });
  sendSuccess(res, member, "Team member updated successfully");
};

// DELETE /team/:id — admin
export const deleteTeamMember = async (req: Request, res: Response): Promise<void> => {
  const member = await prisma.teamMember.delete({ where: { id: req.params.id as string } });
  await StorageService.deleteImages([member.image, member.actualImage].filter((url): url is string => !!url));
  sendSuccess(res, null, "Team member deleted successfully");
};
