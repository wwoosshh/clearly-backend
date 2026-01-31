-- AlterTable
ALTER TABLE "companies" ADD COLUMN "search_score" DECIMAL(5,2);
ALTER TABLE "companies" ADD COLUMN "search_score_at" TIMESTAMP(3);
