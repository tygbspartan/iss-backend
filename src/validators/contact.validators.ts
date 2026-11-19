import { z } from "zod";
import { requiredText } from "./content.validators";
import { calendarDate } from "./date.validators";
import { todayInNepal } from "../utils/date.util";

// Public "Contact Us" form. Every field is required.
export const createInquirySchema = z.object({
  name: requiredText("Name", 150),
  company: requiredText("Company / organization", 200),
  email: z.email("A valid email is required").max(200),
  // Nepali landlines/mobiles and international numbers: digits plus optional
  // + ( ) - and spaces, with 7–15 actual digits.
  phone: requiredText("Contact number", 30).refine((v) => {
    const digits = v.replace(/\D/g, "");
    return /^[+\d\s()-]+$/.test(v) && digits.length >= 7 && digits.length <= 15;
  }, "Enter a valid phone number"),
  // Typed freely, e.g. "Corporate event", "Wedding".
  eventType: requiredText("Type of event", 150),
  // Today or later, by the date in Nepal.
  eventDate: calendarDate("Event date").refine((v) => v >= todayInNepal(), "Event date can't be in the past"),
  requirements: requiredText("Requirements", 5000),
  // Honeypot: hidden from people, so only bots fill it in (see controller).
  website: z.string().max(500).optional(),
});
