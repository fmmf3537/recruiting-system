-- CreateEnum
CREATE TYPE "InterviewRecommendation" AS ENUM ('advance', 'reject', 'hold', 'offer');

-- AlterTable
ALTER TABLE "interview"
ADD COLUMN "recommendation" "InterviewRecommendation",
ADD COLUMN "recommendationNote" TEXT,
ADD COLUMN "recommendedById" TEXT,
ADD COLUMN "recommendedAt" TIMESTAMP(3);
