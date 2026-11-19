import { z } from "zod";
import { requiredText } from "./content.validators";
import { calendarDate as date } from "./date.validators";

const calendarDate = date("Event date");
const eventName = requiredText("Event name", 200);

// Multipart: the fields plus the required "image" file.
export const createUpcomingEventSchema = z.object({
  name: eventName,
  eventDate: calendarDate,
  isActive: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(["true", "false"]).transform((v) => v === "true").optional()
  ),
});

// JSON. The image is replaced through POST /:id/image.
export const updateUpcomingEventSchema = z
  .object({ name: eventName, eventDate: calendarDate, isActive: z.boolean() })
  .partial();
