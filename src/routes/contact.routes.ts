import { Router } from "express";
import rateLimit from "express-rate-limit";
import { createInquiry, getInquiry, listInquiries } from "../controllers/contact.controller";
import { authenticateAdmin } from "../middleware/auth.middleware";
import { validateBody, validateUuidParam } from "../middleware/validate.middleware";
import { createInquirySchema } from "../validators/contact.validators";

const router = Router();
router.param("id", validateUuidParam);

// Spam protection: 5 successful submissions per IP per hour. Rejected
// submissions (validation errors) don't count, so someone fixing a typo in
// the form isn't locked out.
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  skipFailedRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    status: "error",
    message: "You've sent several inquiries already. Please try again in an hour, or call us directly.",
  },
});

// Public: create only.
router.post("/", submitLimiter, validateBody(createInquirySchema), createInquiry);

// Admin: read only. No update or delete endpoints exist.
router.get("/", authenticateAdmin, listInquiries);
router.get("/:id", authenticateAdmin, getInquiry);

export default router;
