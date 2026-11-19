import { Request, Response } from "express";
import prisma from "../config/database.config";
import { BadRequestError, NotFoundError } from "../utils/customError.util";
import { sendSuccess } from "../utils/response.util";

const ORDER = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

// Names are unique regardless of capitalisation ("Management" vs "management"),
// which the database's plain unique index wouldn't catch.
const assertNameFree = async (name: string, exceptId?: string): Promise<void> => {
  const clash = await prisma.department.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true },
  });
  if (clash) {
    throw new BadRequestError("Validation failed", { name: ["A department with this name already exists"] });
  }
};

// GET /departments — public, in display order
export const listDepartments = async (_req: Request, res: Response): Promise<void> => {
  const departments = await prisma.department.findMany({
    orderBy: ORDER,
    select: { id: true, name: true, sortOrder: true, isCore: true },
  });
  sendSuccess(res, departments, "Departments retrieved successfully");
};

// GET /departments/admin/all — admin, with how many members each has
export const listAllDepartments = async (_req: Request, res: Response): Promise<void> => {
  const departments = await prisma.department.findMany({
    orderBy: ORDER,
    include: { _count: { select: { members: true } } },
  });
  sendSuccess(res, departments, "Departments retrieved successfully");
};

// POST /departments — admin
export const createDepartment = async (req: Request, res: Response): Promise<void> => {
  await assertNameFree(req.body.name);
  const department = await prisma.department.create({
    data: req.body,
    include: { _count: { select: { members: true } } },
  });
  sendSuccess(res, department, "Department created successfully", 201);
};

// PATCH /departments/:id — admin
export const updateDepartment = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  if (req.body.name) await assertNameFree(req.body.name, id);
  const department = await prisma.department.update({
    where: { id },
    data: req.body,
    include: { _count: { select: { members: true } } },
  });
  sendSuccess(res, department, "Department updated successfully");
};

// DELETE /departments/:id — admin. Refused while the department has members,
// so nobody is ever left without a department.
export const deleteDepartment = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const department = await prisma.department.findUnique({
    where: { id },
    include: { _count: { select: { members: true } } },
  });
  if (!department) throw new NotFoundError("Department not found");

  const count = department._count.members;
  if (count > 0) {
    throw new BadRequestError(
      `"${department.name}" still has ${count} team ${count === 1 ? "member" : "members"}. Move them to another department first.`
    );
  }

  await prisma.department.delete({ where: { id } });
  sendSuccess(res, null, "Department deleted successfully");
};
