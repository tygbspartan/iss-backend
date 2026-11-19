import { Router } from "express";
import { ZodType } from "zod";
import {
  createSimpleCrudController,
  testimonialController,
  clientController,
} from "../controllers/crud.factory";
import { uploadImageHandler, rejectImageRemoval } from "../controllers/image.helper";
import { cacheResponse, invalidateCacheOnWrite } from "../middleware/cache.middleware";
import { TTL } from "../services/cache.service";
import { authenticateAdmin } from "../middleware/auth.middleware";
import { uploadSingleImage } from "../middleware/upload.middleware";
import { validateBody, validateUuidParam } from "../middleware/validate.middleware";
import { UploadFolder } from "../services/storage.service";
import {
  createTestimonialSchema,
  updateTestimonialSchema,
  createClientSchema,
  updateClientSchema,
} from "../validators/content.validators";

// Same route layout for every resource built by createSimpleCrudController.
const buildRoutes = (
  controller: ReturnType<typeof createSimpleCrudController>,
  model: "testimonial" | "client",
  folder: UploadFolder,
  cacheNamespace: string,
  createSchema: ZodType,
  updateSchema: ZodType
): Router => {
  const router = Router();
  router.param("id", validateUuidParam);
  router.use(invalidateCacheOnWrite(cacheNamespace));

  // Public
  router.get("/", cacheResponse(cacheNamespace, TTL.LIST), controller.listActive);

  // Admin — "/admin/all" is declared before "/:id" so it isn't captured as an id
  router.get("/admin/all", authenticateAdmin, controller.listAll);
  router.get("/:id", authenticateAdmin, controller.getById);
  // Multipart: fields + required "image" file in one request.
  router.post("/", authenticateAdmin, ...uploadSingleImage("image"), validateBody(createSchema), controller.create);
  router.patch("/:id", authenticateAdmin, validateBody(updateSchema), controller.update);
  router.delete("/:id", authenticateAdmin, controller.remove);

  // Replace image (multipart/form-data, field "image")
  router.post("/:id/image", authenticateAdmin, uploadSingleImage("image"), uploadImageHandler(model, folder));
  router.delete("/:id/image", authenticateAdmin, rejectImageRemoval); // image is mandatory

  return router;
};

export const testimonialRoutes = buildRoutes(
  testimonialController, "testimonial", "testimonials", "testimonials", createTestimonialSchema, updateTestimonialSchema
);
export const clientRoutes = buildRoutes(
  clientController, "client", "clients", "clients", createClientSchema, updateClientSchema
);
