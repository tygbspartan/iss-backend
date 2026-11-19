-- Departments become their own table; team members pick one instead of typing it.
--
-- Hand-written: Prisma's generated version drops "team_members"."department"
-- outright, losing every member's department. This keeps the data by turning
-- each distinct department name into a row and linking members to it.

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_core" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- One department per distinct name already in use. Display order matches what
-- the Teams page did until now: founders first, then management, then the rest
-- alphabetically. The founders' department starts as the "core" one (shown on
-- the About page); change it in the admin panel.
INSERT INTO "departments" ("id", "name", "sort_order", "is_core", "updated_at")
SELECT
    gen_random_uuid(),
    d."name",
    (ROW_NUMBER() OVER (
        ORDER BY
            CASE
                WHEN d."name" ILIKE '%founder%' THEN 0
                WHEN d."name" ILIKE '%manag%' THEN 1
                ELSE 2
            END,
            LOWER(d."name")
    ) - 1)::int,
    d."name" ILIKE '%founder%',
    CURRENT_TIMESTAMP
FROM (SELECT DISTINCT TRIM("department") AS "name" FROM "team_members") d;

-- Link each member to its department.
ALTER TABLE "team_members" ADD COLUMN "department_id" UUID;

UPDATE "team_members" m
SET "department_id" = d."id"
FROM "departments" d
WHERE d."name" = TRIM(m."department");

-- Every member had a department (the old column was NOT NULL), so this holds.
ALTER TABLE "team_members" ALTER COLUMN "department_id" SET NOT NULL;
ALTER TABLE "team_members" DROP COLUMN "department";

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE INDEX "departments_sort_order_idx" ON "departments"("sort_order");

-- CreateIndex
CREATE INDEX "team_members_department_id_idx" ON "team_members"("department_id");

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
