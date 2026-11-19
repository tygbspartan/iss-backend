import { Router } from "express";
import { getInstagramFeed, getInstagramStatus, renewInstagramToken } from "../controllers/instagram.controller";
import { authenticateAdmin } from "../middleware/auth.middleware";

const router = Router();

// Public: the posts shown on the website. (Cached in memory by the service.)
router.get("/", getInstagramFeed);

// Admin: token health, and a manual "renew now".
router.get("/status", authenticateAdmin, getInstagramStatus);
router.post("/renew", authenticateAdmin, renewInstagramToken);

export default router;
