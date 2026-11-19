import { Router } from "express";
import {
  listServices,
  getServiceBySlug,
  listAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
} from "../controllers/service.controller";
import { uploadImageHandler, rejectImageRemoval } from "../controllers/image.helper";
import { cacheResponse, invalidateCacheOnWrite } from "../middleware/cache.middleware";
import { TTL } from "../services/cache.service";
import { authenticateAdmin } from "../middleware/auth.middleware";
import { uploadSingleImage } from "../middleware/upload.middleware";
import { validateBody, validateUuidParam } from "../middleware/validate.middleware";
import { createServiceSchema, updateServiceSchema } from "../validators/content.validators";

const router = Router();
router.param("id", validateUuidParam);
// Project pages embed their services (and vice versa), so writes clear both.
router.use(invalidateCacheOnWrite("services", "projects"));

// Public
router.get("/", cacheResponse("services", TTL.LIST), listServices);
router.get("/slug/:slug", cacheResponse("services", TTL.DETAIL), getServiceBySlug);

// Admin — "/admin/all" is declared before "/:id" so it isn't captured as an id
router.get("/admin/all", authenticateAdmin, listAllServices);
router.get("/:id", authenticateAdmin, getServiceById);
// Multipart: fields + required "image" file in one request.
router.post("/", authenticateAdmin, ...uploadSingleImage("image"), validateBody(createServiceSchema), createService);
router.patch("/:id", authenticateAdmin, validateBody(updateServiceSchema), updateService);
router.delete("/:id", authenticateAdmin, deleteService);

// Replace image (multipart/form-data, field "image")
router.post("/:id/image", authenticateAdmin, uploadSingleImage("image"), uploadImageHandler("service", "services"));
router.delete("/:id/image", authenticateAdmin, rejectImageRemoval); // image is mandatory

export default router;
