import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "../config/env.config";

export interface JwtPayload {
  userId: string;
  role: string;
}

export class AuthService {
  static comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static generateToken(payload: JwtPayload): string {
    return jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn as SignOptions["expiresIn"],
    });
  }

  /** Throws if the token is invalid or expired. */
  static verifyToken(token: string): JwtPayload {
    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: ["HS256"],
    }) as jwt.JwtPayload;
    return { userId: decoded.userId, role: decoded.role };
  }
}
