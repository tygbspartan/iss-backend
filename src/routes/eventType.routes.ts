import { Router } from "express";
import {
  listEventTypes,
  listAllEventTypes,
  createEventType,
  updateEventType,
  deleteEventType,
} from "../controllers/eventType.controller";
import { cacheResponse, invalidateCacheOnWrite } from "../middleware/cache.middleware";
import { TTL } from "../services/cache.service";
import { authenticateAdmin } from "../middleware/auth.middleware";
import { validateBody, validateUuidParam } from "../middleware/validate.middleware";
import { createEventTypeSchema, updateEventTypeSchema } from "../validators/content.validators";

const router = Router();
router.param("id", validateUuidParam);
// Project responses embed their event type, so writes clear both.
router.use(invalidateCacheOnWrite("event-types", "projects"));

// Public
router.get("/", cacheResponse("event-types", TTL.LIST), listEventTypes);

// Admin
router.get("/admin/all", authenticateAdmin, listAllEventTypes);
router.post("/", authenticateAdmin, validateBody(createEventTypeSchema), createEventType);
router.patch("/:id", authenticateAdmin, validateBody(updateEventTypeSchema), updateEventType);
router.delete("/:id", authenticateAdmin, deleteEventType);

export default router;
