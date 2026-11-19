import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { login, getMe } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validate.middleware";

const router = Router();

// Brute-force protection: 10 failed attempts per IP per 15 minutes. Successful
// logins don't count, so a legitimate admin isn't locked out by normal use.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { status: "error", message: "Too many login attempts. Try again later." },
});

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

router.post("/login", loginLimiter, validateBody(loginSchema), login);
router.get("/me", authenticate, getMe);

export default router;
