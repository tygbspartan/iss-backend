import { Response } from "express";

export const sendSuccess = (
  res: Response,
  data: any = null,
  message: string = "Success",
  statusCode: number = 200
): Response =>
  res.status(statusCode).json({
    status: "success",
    message,
    data,
  });
