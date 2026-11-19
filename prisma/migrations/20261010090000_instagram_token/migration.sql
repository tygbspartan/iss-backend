-- CreateTable
CREATE TABLE "instagram_token" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "access_token" TEXT NOT NULL,
    "seed_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "refreshed_at" TIMESTAMP(3) NOT NULL,
    "last_error" TEXT,
    "last_alert_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_token_pkey" PRIMARY KEY ("id")
);
