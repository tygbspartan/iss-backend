-- CreateTable
CREATE TABLE "upcoming_events" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "event_date" DATE NOT NULL,
    "image" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upcoming_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "upcoming_events_is_active_event_date_idx" ON "upcoming_events"("is_active", "event_date");

