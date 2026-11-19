-- New "Contact Us" fields. Existing inquiries are kept:
--   • "Your Event Vision" became "Tell us about your requirements" — the
--     column is renamed, so what people already wrote stays.
--   • company: new, required on the form; older inquiries get an empty value.
--   • event_date: new, required on the form; empty (NULL) on older inquiries.
--   • tentative_days and expected_guests are no longer asked, and are dropped.
ALTER TABLE "contact_inquiries" RENAME COLUMN "event_vision" TO "requirements";

ALTER TABLE "contact_inquiries" ADD COLUMN "company" TEXT NOT NULL DEFAULT '';
ALTER TABLE "contact_inquiries" ALTER COLUMN "company" DROP DEFAULT;

ALTER TABLE "contact_inquiries" ADD COLUMN "event_date" DATE;

ALTER TABLE "contact_inquiries" DROP COLUMN "tentative_days",
DROP COLUMN "expected_guests";
