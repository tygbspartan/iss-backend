import { Request, Response, NextFunction } from "express";
import { z, ZodType, ZodError } from "zod";
import { BadRequestError, NotFoundError } from "../utils/customError.util";

// Validates & sanitises the request body against a Zod schema before the
// controller runs. On success `req.body` is replaced with the parsed (stripped)
// value — unknown fields are dropped, closing mass-assignment. On failure a 400
// with per-field errors is returned via the standard error handler.
//
// Only `body` is reassigned — in Express 5 `req.query`/`req.params` are getters.
export const validateBody =
  (schema: ZodType) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body ?? {});
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          new BadRequestError("Validation failed", z.flattenError(err).fieldErrors)
        );
      }
      next(err);
    }
  };

const uuidSchema = z.uuid();

// For router.param("id", ...). A malformed id can't match any row, so answer
// 404 up front instead of letting Postgres reject the UUID cast.
export const validateUuidParam = (
  _req: Request,
  _res: Response,
  next: NextFunction,
  value: string
): void => {
  if (!uuidSchema.safeParse(value).success) {
    return next(new NotFoundError("Record not found."));
  }
  next();
};
