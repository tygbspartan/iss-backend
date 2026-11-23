-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "event_type_id" UUID;

-- CreateTable
CREATE TABLE "event_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_types_name_key" ON "event_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "event_types_slug_key" ON "event_types"("slug");

-- CreateIndex
CREATE INDEX "event_types_sort_order_idx" ON "event_types"("sort_order");

-- CreateIndex
CREATE INDEX "projects_event_type_id_idx" ON "projects"("event_type_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "event_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

