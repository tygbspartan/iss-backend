import { Router } from "express";
import healthRoutes from "./health.routes";
import authRoutes from "./auth.routes";
import serviceRoutes from "./service.routes";
import projectRoutes from "./project.routes";
import blogRoutes from "./blog.routes";
import contactRoutes from "./contact.routes";
import instagramRoutes from "./instagram.routes";
import upcomingEventRoutes from "./upcomingEvent.routes";
import { testimonialRoutes, clientRoutes } from "./simpleContent.routes";
import { teamRoutes, departmentRoutes } from "./team.routes";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/services", serviceRoutes);
router.use("/projects", projectRoutes);
router.use("/team", teamRoutes);
router.use("/departments", departmentRoutes);
router.use("/blogs", blogRoutes);
router.use("/testimonials", testimonialRoutes);
router.use("/clients", clientRoutes);
router.use("/contact", contactRoutes);
router.use("/instagram", instagramRoutes);
router.use("/upcoming-events", upcomingEventRoutes);

export default router;
