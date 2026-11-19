import { Request, Response } from "express";
import prisma from "../config/database.config";
import { StorageService, UploadFolder } from "../services/storage.service";
import { NotFoundError } from "../utils/customError.util";
import { sendSuccess } from "../utils/response.util";
import { createWithImage } from "./image.helper";

// Testimonials and clients share the same shape: a flat record with one
// required image, an isActive flag and a sortOrder. This builds their handlers.
// (Services, projects, blogs and team members have relations/slugs/publishing
// and get their own controllers.)
type SimpleModel = "testimonial" | "client";

const ORDER = [{ sortOrder: "asc" as const }, { createdAt: "desc" as const }];

export const createSimpleCrudController = (
  model: SimpleModel,
  label: string,
  folder: UploadFolder
) => {
  const db = prisma[model] as any;

  return {
    // GET / — public, active only
    listActive: async (_req: Request, res: Response): Promise<void> => {
      const items = await db.findMany({ where: { isActive: true }, orderBy: ORDER });
      sendSuccess(res, items, `${label}s retrieved successfully`);
    },

    // GET /admin/all — admin, includes inactive
    listAll: async (_req: Request, res: Response): Promise<void> => {
      const items = await db.findMany({ orderBy: ORDER });
      sendSuccess(res, items, `${label}s retrieved successfully`);
    },

    // GET /:id — admin
    getById: async (req: Request, res: Response): Promise<void> => {
      const item = await db.findUnique({ where: { id: req.params.id } });
      if (!item) throw new NotFoundError(`${label} not found`);
      sendSuccess(res, item, `${label} retrieved successfully`);
    },

    // POST / — admin, multipart (fields + required "image" file)
    create: async (req: Request, res: Response): Promise<void> => {
      const item = await createWithImage(req, folder, (image) =>
        db.create({ data: { ...req.body, image } })
      );
      sendSuccess(res, item, `${label} created successfully`, 201);
    },

    // PATCH /:id — admin
    update: async (req: Request, res: Response): Promise<void> => {
      const item = await db.update({ where: { id: req.params.id }, data: req.body });
      sendSuccess(res, item, `${label} updated successfully`);
    },

    // DELETE /:id — admin
    remove: async (req: Request, res: Response): Promise<void> => {
      const item = await db.delete({ where: { id: req.params.id } });
      await StorageService.deleteImage(item.image);
      sendSuccess(res, null, `${label} deleted successfully`);
    },
  };
};

export const testimonialController = createSimpleCrudController("testimonial", "Testimonial", "testimonials");
export const clientController = createSimpleCrudController("client", "Client", "clients");
