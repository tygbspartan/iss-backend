import { Router } from "express";
import {
  listProjects,
  getProjectBySlug,
  listAllProjects,
  getProjectById,
  createProject,
  updateProject,
  addThumbnails,
  deleteProject,
} from "../controllers/project.controller";
import { uploadImageHandler, rejectImageRemoval } from "../controllers/image.helper";
import { cacheResponse, invalidateCacheOnWrite } from "../middleware/cache.middleware";
import { TTL } from "../services/cache.service";
import { authenticateAdmin } from "../middleware/auth.middleware";
import { uploadSingleImage, uploadImages } from "../middleware/upload.middleware";
import { validateBody, validateUuidParam } from "../middleware/validate.middleware";
import { createProjectSchema, updateProjectSchema } from "../validators/content.validators";

const router = Router();
router.param("id", validateUuidParam);
// Service pages embed their projects (and vice versa), and event types count
// their projects, so writes clear all three.
router.use(invalidateCacheOnWrite("projects", "services", "event-types"));

// Public
router.get("/", cacheResponse("projects", TTL.LIST), listProjects);
router.get("/slug/:slug", cacheResponse("projects", TTL.DETAIL), getProjectBySlug);

// Admin — "/admin/all" is declared before "/:id" so it isn't captured as an id
router.get("/admin/all", authenticateAdmin, listAllProjects);
router.get("/:id", authenticateAdmin, getProjectById);
// Multipart: fields + required "image" file in one request.
router.post("/", authenticateAdmin, ...uploadSingleImage("image"), validateBody(createProjectSchema), createProject);
router.patch("/:id", authenticateAdmin, validateBody(updateProjectSchema), updateProject);
router.delete("/:id", authenticateAdmin, deleteProject);

// Replace image (multipart/form-data, field "image")
router.post("/:id/image", authenticateAdmin, uploadSingleImage("image"), uploadImageHandler("project", "projects"));
router.delete("/:id/image", authenticateAdmin, rejectImageRemoval); // image is mandatory

// Gallery (multipart/form-data, field "thumbnails", up to 10 files per request).
// Reorder/remove via PATCH /:id with a `thumbnails` array.
router.post("/:id/thumbnails", authenticateAdmin, uploadImages("thumbnails"), addThumbnails);

export default router;
