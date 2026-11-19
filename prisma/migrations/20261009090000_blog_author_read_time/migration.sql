-- AlterTable
ALTER TABLE "blogs" ADD COLUMN     "author" TEXT NOT NULL DEFAULT 'ISS Nepal',
ADD COLUMN     "read_time" INTEGER NOT NULL DEFAULT 5;

