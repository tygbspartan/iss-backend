import { Request, Response } from "express";
import prisma from "../config/database.config";
import { AuthService } from "../services/auth.service";
import { UnauthorizedError } from "../utils/customError.util";
import { sendSuccess } from "../utils/response.util";

export const login = async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  const user = await prisma.user.findUnique({ where: { username } });
  // Same message for unknown user and wrong password — don't reveal which.
  if (!user || !(await AuthService.comparePassword(password, user.passwordHash))) {
    throw new UnauthorizedError("Invalid username or password");
  }

  const token = AuthService.generateToken({ userId: user.id, role: user.role });

  sendSuccess(
    res,
    { token, user: { id: user.id, username: user.username, role: user.role } },
    "Logged in successfully"
  );
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  sendSuccess(res, req.user, "Current user");
};
