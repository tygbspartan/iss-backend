import { ContactInquiry } from "@prisma/client";
import { config } from "../config/env.config";
import { EmailService } from "../services/email.service";

// Everything in an inquiry is typed by a stranger, so it is escaped before it
// goes anywhere near HTML.
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Subjects are a single header line — collapse any line breaks.
const oneLine = (value: string): string => value.replace(/\s+/g, " ").trim();

const formatReceived = (date: Date): string =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kathmandu",
  }).format(date) + " (Nepal time)";

// The event's day, e.g. "Mon, 15 Dec 2026". Stored as midnight UTC, so it's
// formatted in UTC to keep the same day.
const formatEventDate = (date: Date | null): string =>
  date
    ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date)
    : "—";

const row = (label: string, valueHtml: string): string => `
      <tr>
        <td style="padding:10px 16px 10px 0;font-size:13px;color:#6b7280;vertical-align:top;white-space:nowrap;border-bottom:1px solid #f0f0f0;">${label}</td>
        <td style="padding:10px 0;font-size:15px;color:#111827;border-bottom:1px solid #f0f0f0;">${valueHtml}</td>
      </tr>`;

export const buildInquiryEmail = (inquiry: ContactInquiry) => {
  const eventDate = formatEventDate(inquiry.eventDate);
  const received = formatReceived(inquiry.createdAt);
  const telHref = inquiry.phone.replace(/[^\d+]/g, "");

  const subject = oneLine(`New inquiry: ${inquiry.name} — ${inquiry.eventType}`).slice(0, 200);

  const text = [
    "New inquiry from the ISS Nepal website",
    "",
    `Name:           ${inquiry.name}`,
    `Company:        ${inquiry.company}`,
    `Email:          ${inquiry.email}`,
    `Contact number: ${inquiry.phone}`,
    `Type of event:  ${inquiry.eventType}`,
    `Event date:     ${eventDate}`,
    `Received:       ${received}`,
    "",
    "Requirements:",
    inquiry.requirements,
    "",
    "Reply to this email to answer the customer directly.",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="background:#111111;padding:22px 28px;">
          <div style="font-size:12px;letter-spacing:2px;color:#9ca3af;text-transform:uppercase;">ISS Nepal · Contact Us</div>
          <div style="margin-top:6px;font-size:22px;font-weight:bold;color:#ffffff;">New inquiry</div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 28px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${row("Name", escapeHtml(inquiry.name))}${row("Company", escapeHtml(inquiry.company))}${row(
            "Email",
            `<a href="mailto:${escapeHtml(inquiry.email)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(inquiry.email)}</a>`
          )}${row(
            "Contact number",
            `<a href="tel:${escapeHtml(telHref)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(inquiry.phone)}</a>`
          )}${row("Type of event", escapeHtml(inquiry.eventType))}${row("Event date", eventDate)}${row("Received", received)}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px 8px;">
          <div style="font-size:13px;color:#6b7280;margin-bottom:8px;">Requirements</div>
          <div style="font-size:15px;line-height:1.6;color:#111827;background:#f9fafb;border-radius:8px;padding:14px 16px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(inquiry.requirements)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px 28px;font-size:13px;color:#6b7280;">
          Reply to this email to answer ${escapeHtml(inquiry.name)} directly.
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
};

/** Email the inquiry to the address(es) in CONTACT_NOTIFY_EMAIL. Never throws. */
export const sendInquiryNotification = (inquiry: ContactInquiry): Promise<boolean> =>
  EmailService.send({
    to: config.contactNotifyEmail,
    replyTo: inquiry.email, // hitting "Reply" writes to the customer
    ...buildInquiryEmail(inquiry),
  });
