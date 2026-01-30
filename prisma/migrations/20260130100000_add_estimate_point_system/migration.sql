-- CreateEnum
CREATE TYPE "EstimateRequestStatus" AS ENUM ('OPEN', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PointTransactionType" AS ENUM ('CHARGE', 'USE', 'REFUND');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('NONE', 'REQUESTED', 'APPROVED', 'REJECTED');

-- AlterEnum: Add new values to CleaningType
ALTER TYPE "CleaningType" ADD VALUE 'OFFICE';
ALTER TYPE "CleaningType" ADD VALUE 'STORE';
ALTER TYPE "CleaningType" ADD VALUE 'CONSTRUCTION';
ALTER TYPE "CleaningType" ADD VALUE 'AIRCON';
ALTER TYPE "CleaningType" ADD VALUE 'CARPET';
ALTER TYPE "CleaningType" ADD VALUE 'EXTERIOR';

-- AlterTable: matchings - make company_id optional, add estimate_id
ALTER TABLE "matchings" ALTER COLUMN "company_id" DROP NOT NULL;
ALTER TABLE "matchings" ADD COLUMN "estimate_id" TEXT;

-- AlterTable: matchings - change desired_time to VARCHAR(50)
ALTER TABLE "matchings" ALTER COLUMN "desired_time" TYPE VARCHAR(50);

-- CreateIndex
CREATE UNIQUE INDEX "matchings_estimate_id_key" ON "matchings"("estimate_id");

-- AlterTable: chat_rooms - make matching_id optional, add new columns
ALTER TABLE "chat_rooms" ALTER COLUMN "matching_id" DROP NOT NULL;
ALTER TABLE "chat_rooms" ADD COLUMN "user_declined" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "chat_rooms" ADD COLUMN "company_declined" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "chat_rooms" ADD COLUMN "refund_status" "RefundStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "chat_rooms" ADD COLUMN "estimate_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "chat_rooms_estimate_id_key" ON "chat_rooms"("estimate_id");

-- CreateTable: estimate_requests
CREATE TABLE "estimate_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "cleaning_type" "CleaningType" NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "detail_address" VARCHAR(200),
    "area_size" INTEGER,
    "desired_date" DATE,
    "desired_time" VARCHAR(50),
    "message" TEXT NOT NULL,
    "budget" INTEGER,
    "status" "EstimateRequestStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable: estimates
CREATE TABLE "estimates" (
    "id" TEXT NOT NULL,
    "estimate_request_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "message" TEXT,
    "estimated_duration" VARCHAR(50),
    "available_date" DATE,
    "points_used" INTEGER NOT NULL DEFAULT 0,
    "status" "EstimateStatus" NOT NULL DEFAULT 'SUBMITTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: point_wallets
CREATE TABLE "point_wallets" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "point_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable: point_transactions
CREATE TABLE "point_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "type" "PointTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" VARCHAR(200),
    "related_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimate_requests_status_created_at_idx" ON "estimate_requests"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "estimate_requests_user_id_idx" ON "estimate_requests"("user_id");

-- CreateIndex
CREATE INDEX "estimates_estimate_request_id_idx" ON "estimates"("estimate_request_id");

-- CreateIndex
CREATE INDEX "estimates_company_id_idx" ON "estimates"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "point_wallets_company_id_key" ON "point_wallets"("company_id");

-- CreateIndex
CREATE INDEX "point_transactions_wallet_id_created_at_idx" ON "point_transactions"("wallet_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "matchings" ADD CONSTRAINT "matchings_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_requests" ADD CONSTRAINT "estimate_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_estimate_request_id_fkey" FOREIGN KEY ("estimate_request_id") REFERENCES "estimate_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_wallets" ADD CONSTRAINT "point_wallets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "point_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey (기존 matchings company_id FK를 재생성 - optional로 변경)
ALTER TABLE "matchings" DROP CONSTRAINT "matchings_company_id_fkey";
ALTER TABLE "matchings" ADD CONSTRAINT "matchings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropForeignKey (기존 chat_rooms matching_id FK를 재생성 - optional로 변경)
ALTER TABLE "chat_rooms" DROP CONSTRAINT "chat_rooms_matching_id_fkey";
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_matching_id_fkey" FOREIGN KEY ("matching_id") REFERENCES "matchings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
