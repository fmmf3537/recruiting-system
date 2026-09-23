-- CreateEnum
CREATE TYPE "CandidateInterviewResponse" AS ENUM ('pending', 'confirmed', 'reschedule_requested', 'declined', 'no_show');

-- AlterTable
ALTER TABLE "interview"
ADD COLUMN "candidateResponse" "CandidateInterviewResponse" NOT NULL DEFAULT 'pending',
ADD COLUMN "candidateResponseNote" TEXT,
ADD COLUMN "candidateRespondedAt" TIMESTAMP(3);
