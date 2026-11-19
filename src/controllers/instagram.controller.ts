import { Request, Response } from "express";
import { InstagramService } from "../services/instagram.service";
import { BadRequestError } from "../utils/customError.util";
import { sendSuccess } from "../utils/response.util";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 12;

// GET /instagram — public. The newest posts for the website's feed. ?limit=
// (1–12, default 6). Always answers 200: `configured` says whether a token is
// set up at all, and `posts` is empty if Instagram couldn't be reached, so the
// website can simply leave the section out.
export const getInstagramFeed = async (req: Request, res: Response): Promise<void> => {
  const requested = Number.parseInt(String(req.query.limit ?? DEFAULT_LIMIT), 10);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isNaN(requested) ? DEFAULT_LIMIT : requested));

  const configured = await InstagramService.isConfigured();
  const posts = configured ? await InstagramService.getPosts(limit).catch(() => []) : [];
  sendSuccess(res, { configured, posts }, "Instagram posts retrieved successfully");
};

// GET /instagram/status — admin. Token expiry, last renewal and last error.
// Never returns the token itself.
export const getInstagramStatus = async (_req: Request, res: Response): Promise<void> => {
  sendSuccess(res, await InstagramService.getStatus(), "Instagram status retrieved successfully");
};

// POST /instagram/renew — admin. Renew the token now instead of waiting for
// the schedule. Instagram refuses if the token is under 24 hours old or has
// already expired; its reason is passed back.
export const renewInstagramToken = async (_req: Request, res: Response): Promise<void> => {
  try {
    const status = await InstagramService.renewNow();
    if (!status) throw new BadRequestError("Instagram is not set up: INSTAGRAM_ACCESS_TOKEN is not set");
    sendSuccess(res, status, "Instagram token renewed");
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError(`Instagram refused to renew the token: ${(error as Error).message}`);
  }
};
