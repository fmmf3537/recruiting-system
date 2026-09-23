-- CreateEnum
CREATE TYPE "InterviewFeedbackStatus" AS ENUM ('pending', 'all_submitted');

-- AlterTable
ALTER TABLE "interview"
ADD COLUMN "feedbackStatus" "InterviewFeedbackStatus" NOT NULL DEFAULT 'pending';
