import { Request, Response, NextFunction } from "express";
import prisma from "../config/database.config";
import { AuthService } from "../services/auth.service";
import { ForbiddenError, UnauthorizedError } from "../utils/customError.util";

export interface AuthUser {
  id: string;
  username: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Verifies the Bearer JWT and re-loads the user from the DB, so a deleted user
// or a changed role takes effect immediately rather than when the token expires.
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return next(new UnauthorizedError("No token provided. Please login."));
  }

  let userId: string;
  try {
    userId = AuthService.verifyToken(authHeader.slice(7)).userId;
  } catch {
    return next(new UnauthorizedError("Invalid or expired token. Please login again."));
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, role: true },
  });
  if (!user) {
    return next(new UnauthorizedError("User not found. Please login again."));
  }

  req.user = user;
  next();
};

export const isAdmin = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.user?.role !== "admin") {
    return next(new ForbiddenError("Access denied. Admin privileges required."));
  }
  next();
};

export const authenticateAdmin = [authenticate, isAdmin];
