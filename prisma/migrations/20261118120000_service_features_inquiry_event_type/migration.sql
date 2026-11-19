-- Services: a list of what each one includes, shown on its page.
ALTER TABLE "services" ADD COLUMN "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Contact inquiries: "Type of Event" is now typed in freely instead of
-- picked from the services, so inquiries no longer link to a service. The
-- service name each older inquiry was sent with is kept as its event type.
ALTER TABLE "contact_inquiries" DROP CONSTRAINT "contact_inquiries_service_id_fkey";
DROP INDEX "contact_inquiries_service_id_idx";
ALTER TABLE "contact_inquiries" DROP COLUMN "service_id";
ALTER TABLE "contact_inquiries" RENAME COLUMN "service_title" TO "event_type";
