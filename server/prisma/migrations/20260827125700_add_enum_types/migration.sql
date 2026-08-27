-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'member');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('in_progress', 'passed', 'rejected');

-- CreateEnum
CREATE TYPE "InterviewConclusion" AS ENUM ('pass', 'reject', 'pending');

-- CreateEnum
CREATE TYPE "OfferResult" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'sent');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');

-- AlterTable: user.role（空字符串兜底为 member，禁止 DROP COLUMN）
ALTER TABLE "user" ALTER COLUMN "role" TYPE "UserRole" USING COALESCE(NULLIF("role", ''), 'member')::"UserRole";

-- AlterTable: stage_record.status（空字符串兜底为 in_progress）
ALTER TABLE "stage_record" ALTER COLUMN "status" TYPE "StageStatus" USING COALESCE(NULLIF("status", ''), 'in_progress')::"StageStatus";

-- AlterTable: interview_feedback.conclusion（NULL/空字符串兜底为 pending）
ALTER TABLE "interview_feedback" ALTER COLUMN "conclusion" TYPE "InterviewConclusion" USING COALESCE(NULLIF("conclusion", ''), 'pending')::"InterviewConclusion";

-- AlterTable: offer.result（空字符串兜底为 pending）
ALTER TABLE "offer" ALTER COLUMN "result" TYPE "OfferResult" USING COALESCE(NULLIF("result", ''), 'pending')::"OfferResult";

-- AlterTable: offer.status（空字符串兜底为 draft；默认值从 text 切到 enum）
ALTER TABLE "offer" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "offer" ALTER COLUMN "status" TYPE "OfferStatus" USING COALESCE(NULLIF("status", ''), 'draft')::"OfferStatus";
ALTER TABLE "offer" ALTER COLUMN "status" SET DEFAULT 'draft'::"OfferStatus";

-- AlterTable: interview.status（NULL 兜底为 scheduled；默认值从 text 切到 enum）
ALTER TABLE "interview" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "interview" ALTER COLUMN "status" TYPE "InterviewStatus" USING COALESCE(NULLIF("status", ''), 'scheduled')::"InterviewStatus";
ALTER TABLE "interview" ALTER COLUMN "status" SET DEFAULT 'scheduled'::"InterviewStatus";
