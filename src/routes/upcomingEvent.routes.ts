import { Router } from "express";
import {
  UPCOMING_EVENTS_CACHE,
  createUpcomingEvent,
  deleteUpcomingEvent,
  getUpcomingEvent,
  listAllUpcomingEvents,
  listUpcomingEvents,
  serializeEvent,
  updateUpcomingEvent,
} from "../controllers/upcomingEvent.controller";
import { rejectImageRemoval, uploadImageHandler } from "../controllers/image.helper";
import { authenticateAdmin } from "../middleware/auth.middleware";
import { cacheResponse, invalidateCacheOnWrite } from "../middleware/cache.middleware";
import { uploadSingleImage } from "../middleware/upload.middleware";
import { validateBody, validateUuidParam } from "../middleware/validate.middleware";
import { createUpcomingEventSchema, updateUpcomingEventSchema } from "../validators/upcomingEvent.validators";

const router = Router();
router.param("id", validateUuidParam);
router.use(invalidateCacheOnWrite(UPCOMING_EVENTS_CACHE));

// Public. Cached for one minute only, so a finished event disappears promptly.
router.get("/", cacheResponse(UPCOMING_EVENTS_CACHE, 60), listUpcomingEvents);

// Admin — "/admin/all" is declared before "/:id" so it isn't captured as an id
router.get("/admin/all", authenticateAdmin, listAllUpcomingEvents);
router.get("/:id", authenticateAdmin, getUpcomingEvent);
// Multipart: fields + required "image" file in one request.
router.post("/", authenticateAdmin, ...uploadSingleImage("image"), validateBody(createUpcomingEventSchema), createUpcomingEvent);
router.patch("/:id", authenticateAdmin, validateBody(updateUpcomingEventSchema), updateUpcomingEvent);
router.delete("/:id", authenticateAdmin, deleteUpcomingEvent);

// Replace image (multipart/form-data, field "image")
router.post("/:id/image", authenticateAdmin, uploadSingleImage("image"), uploadImageHandler("upcomingEvent", "events", serializeEvent));
router.delete("/:id/image", authenticateAdmin, rejectImageRemoval); // image is mandatory

export default router;
