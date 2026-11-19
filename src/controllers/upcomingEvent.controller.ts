import { Request, Response } from "express";
import { UpcomingEvent } from "@prisma/client";
import prisma from "../config/database.config";
import { CacheService } from "../services/cache.service";
import { StorageService } from "../services/storage.service";
import { BadRequestError, NotFoundError } from "../utils/customError.util";
import { sendSuccess } from "../utils/response.util";
import { todayInNepal, toDateString, toDbDate } from "../utils/date.util";
import { createWithImage } from "./image.helper";

export const UPCOMING_EVENTS_CACHE = "upcoming-events";

// An event stays active through the whole of its day in Nepal (todayInNepal).

/** Responses give eventDate as plain "YYYY-MM-DD", never with a time. */
export const serializeEvent = (event: UpcomingEvent) => ({ ...event, eventDate: toDateString(event.eventDate) });

/** Marks events whose date has passed as inactive. Returns how many changed. */
export const deactivateExpiredEvents = async (): Promise<number> => {
  const { count } = await prisma.upcomingEvent.updateMany({
    where: { isActive: true, eventDate: { lt: toDbDate(todayInNepal()) } },
    data: { isActive: false },
  });
  if (count > 0) await CacheService.invalidate(UPCOMING_EVENTS_CACHE);
  return count;
};

const pastDateError = () =>
  new BadRequestError("Validation failed", { eventDate: ["Event date can't be in the past"] });

// GET /upcoming-events — public: active events that haven't passed, soonest first.
// The date is checked here as well, so an event drops off as soon as its day
// ends even if the hourly job hasn't run yet.
export const listUpcomingEvents = async (_req: Request, res: Response): Promise<void> => {
  const events = await prisma.upcomingEvent.findMany({
    where: { isActive: true, eventDate: { gte: toDbDate(todayInNepal()) } },
    orderBy: { eventDate: "asc" },
  });
  sendSuccess(res, events.map(serializeEvent), "Upcoming events retrieved successfully");
};

// GET /upcoming-events/admin/all — admin, includes inactive and past events
export const listAllUpcomingEvents = async (_req: Request, res: Response): Promise<void> => {
  await deactivateExpiredEvents();
  const events = await prisma.upcomingEvent.findMany({ orderBy: { eventDate: "desc" } });
  sendSuccess(res, events.map(serializeEvent), "Upcoming events retrieved successfully");
};

// GET /upcoming-events/:id — admin
export const getUpcomingEvent = async (req: Request, res: Response): Promise<void> => {
  await deactivateExpiredEvents();
  const event = await prisma.upcomingEvent.findUnique({ where: { id: req.params.id as string } });
  if (!event) throw new NotFoundError("Upcoming event not found");
  sendSuccess(res, serializeEvent(event), "Upcoming event retrieved successfully");
};

// POST /upcoming-events — admin, multipart (fields + required "image" file)
export const createUpcomingEvent = async (req: Request, res: Response): Promise<void> => {
  const { eventDate, ...data } = req.body;
  if (eventDate < todayInNepal()) throw pastDateError();

  const event = await createWithImage(req, "events", (image) =>
    prisma.upcomingEvent.create({ data: { ...data, eventDate: toDbDate(eventDate), image } })
  );
  sendSuccess(res, serializeEvent(event), "Upcoming event created successfully", 201);
};

// PATCH /upcoming-events/:id — admin. Moving an expired event to a new date
// makes it active again; a past event can't be switched back on.
export const updateUpcomingEvent = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { eventDate, ...data } = req.body;
  const today = todayInNepal();

  const existing = await prisma.upcomingEvent.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Upcoming event not found");
  const wasExpired = toDateString(existing.eventDate) < today;

  if (eventDate && eventDate < today) throw pastDateError();
  if (data.isActive === true && !eventDate && wasExpired) {
    throw new BadRequestError("This event's date has passed. Set a new date to make it active again.");
  }
  if (eventDate && wasExpired && data.isActive === undefined) data.isActive = true;

  const event = await prisma.upcomingEvent.update({
    where: { id },
    data: { ...data, ...(eventDate && { eventDate: toDbDate(eventDate) }) },
  });
  sendSuccess(res, serializeEvent(event), "Upcoming event updated successfully");
};

// DELETE /upcoming-events/:id — admin. Removes the image from storage too.
export const deleteUpcomingEvent = async (req: Request, res: Response): Promise<void> => {
  const event = await prisma.upcomingEvent.delete({ where: { id: req.params.id as string } });
  await StorageService.deleteImage(event.image);
  sendSuccess(res, null, "Upcoming event deleted successfully");
};
