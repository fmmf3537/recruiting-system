-- CreateEnum
CREATE TYPE "InterviewFinalDecision" AS ENUM ('advance', 'reject', 'hold', 'offer');

-- AlterTable
ALTER TABLE "interview"
ADD COLUMN "finalDecision" "InterviewFinalDecision",
ADD COLUMN "finalDecisionNote" TEXT,
ADD COLUMN "finalDecisionStage" TEXT,
ADD COLUMN "decidedById" TEXT,
ADD COLUMN "decidedAt" TIMESTAMP(3);
