-- AlterTable
ALTER TABLE "blogs" ALTER COLUMN "image" SET NOT NULL;

-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "image" SET NOT NULL;

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "image" SET NOT NULL;

-- AlterTable
ALTER TABLE "services" ALTER COLUMN "image" SET NOT NULL;

-- AlterTable
ALTER TABLE "testimonials" ALTER COLUMN "company_name" SET NOT NULL,
ALTER COLUMN "image" SET NOT NULL;

