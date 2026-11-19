import { Router } from "express";
import {
  listBlogs,
  getBlogBySlug,
  listAllBlogs,
  getBlogById,
  createBlog,
  updateBlog,
  deleteBlog,
} from "../controllers/blog.controller";
import { uploadImageHandler, rejectImageRemoval } from "../controllers/image.helper";
import { cacheResponse, invalidateCacheOnWrite } from "../middleware/cache.middleware";
import { TTL } from "../services/cache.service";
import { authenticateAdmin } from "../middleware/auth.middleware";
import { uploadSingleImage } from "../middleware/upload.middleware";
import { validateBody, validateUuidParam } from "../middleware/validate.middleware";
import { createBlogSchema, updateBlogSchema } from "../validators/content.validators";

const router = Router();
router.param("id", validateUuidParam);
router.use(invalidateCacheOnWrite("blogs"));

// Public (published only)
router.get("/", cacheResponse("blogs", TTL.LIST), listBlogs);
router.get("/slug/:slug", cacheResponse("blogs", TTL.DETAIL), getBlogBySlug);

// Admin — "/admin/all" is declared before "/:id" so it isn't captured as an id
router.get("/admin/all", authenticateAdmin, listAllBlogs);
router.get("/:id", authenticateAdmin, getBlogById);
// Multipart: fields + required "image" file in one request.
router.post("/", authenticateAdmin, ...uploadSingleImage("image"), validateBody(createBlogSchema), createBlog);
router.patch("/:id", authenticateAdmin, validateBody(updateBlogSchema), updateBlog);
router.delete("/:id", authenticateAdmin, deleteBlog);

// Replace image (multipart/form-data, field "image")
router.post("/:id/image", authenticateAdmin, uploadSingleImage("image"), uploadImageHandler("blog", "blogs"));
router.delete("/:id/image", authenticateAdmin, rejectImageRemoval); // image is mandatory

export default router;
