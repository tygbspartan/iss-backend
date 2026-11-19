import { Router } from "express";
import {
  listTeam,
  listAllTeam,
  getTeamMember,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  replaceActualImage,
} from "../controllers/team.controller";
import {
  listDepartments,
  listAllDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "../controllers/department.controller";
import { uploadImageHandler, rejectImageRemoval } from "../controllers/image.helper";
import { cacheResponse, invalidateCacheOnWrite } from "../middleware/cache.middleware";
import { TTL } from "../services/cache.service";
import { authenticateAdmin } from "../middleware/auth.middleware";
import { uploadImageFields, uploadSingleImage } from "../middleware/upload.middleware";
import { validateBody, validateUuidParam } from "../middleware/validate.middleware";
import {
  createTeamMemberSchema,
  updateTeamMemberSchema,
  createDepartmentSchema,
  updateDepartmentSchema,
} from "../validators/content.validators";

// Team members and departments share one cache namespace: team responses embed
// each member's department, so a write to either must clear both.
const CACHE = "team";

// ── /api/team ───────────────────────────────────────────────────────────────
export const teamRoutes = Router();
teamRoutes.param("id", validateUuidParam);
teamRoutes.use(invalidateCacheOnWrite(CACHE));

// Public. ?core=true → only members of "core" departments (About page).
teamRoutes.get("/", cacheResponse(CACHE, TTL.LIST), listTeam);

// Admin — "/admin/all" is declared before "/:id" so it isn't captured as an id
teamRoutes.get("/admin/all", authenticateAdmin, listAllTeam);
teamRoutes.get("/:id", authenticateAdmin, getTeamMember);
// Multipart: fields + both required photos ("image" = cartoon, "actualImage" = real) in one request.
teamRoutes.post(
  "/",
  authenticateAdmin,
  ...uploadImageFields(["image", "actualImage"]),
  validateBody(createTeamMemberSchema),
  createTeamMember
);
teamRoutes.patch("/:id", authenticateAdmin, validateBody(updateTeamMemberSchema), updateTeamMember);
teamRoutes.delete("/:id", authenticateAdmin, deleteTeamMember);

// Replace the cartoon (multipart/form-data, field "image")
teamRoutes.post("/:id/image", authenticateAdmin, uploadSingleImage("image"), uploadImageHandler("teamMember", "team"));
teamRoutes.delete("/:id/image", authenticateAdmin, rejectImageRemoval); // mandatory

// Set / replace the actual photo (multipart/form-data, field "actualImage")
teamRoutes.post("/:id/actual-image", authenticateAdmin, uploadSingleImage("actualImage"), replaceActualImage);
teamRoutes.delete("/:id/actual-image", authenticateAdmin, rejectImageRemoval); // mandatory

// ── /api/departments ────────────────────────────────────────────────────────
export const departmentRoutes = Router();
departmentRoutes.param("id", validateUuidParam);
departmentRoutes.use(invalidateCacheOnWrite(CACHE));

// Public
departmentRoutes.get("/", cacheResponse(CACHE, TTL.LIST), listDepartments);

// Admin
departmentRoutes.get("/admin/all", authenticateAdmin, listAllDepartments);
departmentRoutes.post("/", authenticateAdmin, validateBody(createDepartmentSchema), createDepartment);
departmentRoutes.patch("/:id", authenticateAdmin, validateBody(updateDepartmentSchema), updateDepartment);
departmentRoutes.delete("/:id", authenticateAdmin, deleteDepartment);
