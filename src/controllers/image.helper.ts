import { Request, Response } from "express";
import prisma from "../config/database.config";
import { StorageService, UploadFolder } from "../services/storage.service";
import { BadRequestError, NotFoundError } from "../utils/customError.util";
import { sendSuccess } from "../utils/response.util";

// Every content model has a single nullable `image` column, so the upload /
// remove handlers are shared. Each resource's routes wire these up with its
// own model name and storage folder.
type ImageModel = "service" | "project" | "teamMember" | "blog" | "testimonial" | "client" | "upcomingEvent";

const delegate = (model: ImageModel) => prisma[model] as any;

const findImage = async (model: ImageModel, id: string): Promise<string | null> => {
  const row = await delegate(model).findUnique({ where: { id }, select: { image: true } });
  if (!row) throw new NotFoundError("Record not found.");
  return row.image;
};

// POST /:id/image — multipart, field name "image". Replaces any existing image.
export const uploadImageHandler =
  (model: ImageModel, folder: UploadFolder, serialize: (row: any) => unknown = (row) => row) =>
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    if (!req.file) throw new BadRequestError('Image file is required (field name "image")');

    const oldImage = await findImage(model, id);
    const url = await StorageService.uploadImage(req.file, folder);

    let updated;
    try {
      updated = await delegate(model).update({ where: { id }, data: { image: url } });
    } catch (error) {
      await StorageService.deleteImage(url); // don't orphan the new upload
      throw error;
    }

    // Only remove the old file once the DB points at the new one.
    if (oldImage) await StorageService.deleteImage(oldImage);

    sendSuccess(res, serialize(updated), "Image uploaded successfully");
  };

// DELETE /:id/image — every resource's image is mandatory, so it can only be
// replaced (POST /:id/image), never removed.
export const rejectImageRemoval = async (): Promise<void> => {
  throw new BadRequestError("An image is required. Upload a replacement instead of removing it.");
};

/**
 * For create handlers: the image is required and arrives in the same multipart
 * request (field "image"). Stores it, runs `create` with its URL, and deletes
 * the upload again if the create fails so nothing is orphaned.
 */
export const createWithImage = async <T>(
  req: Request,
  folder: UploadFolder,
  create: (image: string) => Promise<T>
): Promise<T> => {
  if (!req.file) {
    throw new BadRequestError("Validation failed", { image: ["Image is required"] });
  }
  const image = await StorageService.uploadImage(req.file, folder);
  try {
    return await create(image);
  } catch (error) {
    await StorageService.deleteImage(image);
    throw error;
  }
};
