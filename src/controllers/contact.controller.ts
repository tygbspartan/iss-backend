import { Request, Response } from "express";
import { ContactInquiry, Prisma } from "@prisma/client";
import prisma from "../config/database.config";
import { NotFoundError } from "../utils/customError.util";
import { sendSuccess } from "../utils/response.util";
import { getPagination, paginated } from "../utils/pagination.util";
import { toDateString, toDbDate } from "../utils/date.util";
import { sendInquiryNotification } from "../emails/inquiryNotification.email";

const SUCCESS_MESSAGE = "Thanks! Your inquiry has been sent. We'll get back to you soon.";

/** Responses give eventDate as plain "YYYY-MM-DD" (or null on older inquiries). */
const serializeInquiry = (inquiry: ContactInquiry) => ({
  ...inquiry,
  eventDate: inquiry.eventDate ? toDateString(inquiry.eventDate) : null,
});

// POST /contact — public, rate limited.
export const createInquiry = async (req: Request, res: Response): Promise<void> => {
  const { website, eventDate, ...data } = req.body;

  // Honeypot filled → almost certainly a bot. Answer exactly like a real
  // success so it learns nothing, but don't store anything.
  if (website) {
    sendSuccess(res, null, SUCCESS_MESSAGE, 201);
    return;
  }

  const inquiry = await prisma.contactInquiry.create({
    data: { ...data, eventDate: toDbDate(eventDate) },
  });

  // Email the team in the background. The inquiry is already saved, so a
  // mail problem never delays or fails the visitor's submission (it's logged,
  // and the inquiry is still in the admin panel).
  void sendInquiryNotification(inquiry);

  // The visitor gets a confirmation only — never the stored record.
  sendSuccess(res, null, SUCCESS_MESSAGE, 201);
};

// GET /contact — admin. Newest first. ?page=&limit=,
// ?q= searches name, company, email, phone and event type.
export const listInquiries = async (req: Request, res: Response): Promise<void> => {
  const pagination = getPagination(req.query);
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";

  const where: Prisma.ContactInquiryWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { company: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { eventType: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const [items, total] = await prisma.$transaction([
    prisma.contactInquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.contactInquiry.count({ where }),
  ]);
  sendSuccess(res, paginated(items.map(serializeInquiry), total, pagination), "Inquiries retrieved successfully");
};

// GET /contact/:id — admin
export const getInquiry = async (req: Request, res: Response): Promise<void> => {
  const inquiry = await prisma.contactInquiry.findUnique({ where: { id: req.params.id as string } });
  if (!inquiry) throw new NotFoundError("Inquiry not found");
  sendSuccess(res, serializeInquiry(inquiry), "Inquiry retrieved successfully");
};
