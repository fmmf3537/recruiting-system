/*
  Warnings:

  - The primary key for the `candidate` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `experience` on the `candidate` table. All the data in the column will be lost.
  - You are about to drop the column `resume` on the `candidate` table. All the data in the column will be lost.
  - You are about to drop the column `skills` on the `candidate` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `candidate` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `candidate` table. All the data in the column will be lost.
  - The primary key for the `job` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `createdBy` on the `job` table. All the data in the column will be lost.
  - You are about to drop the column `department` on the `job` table. All the data in the column will be lost.
  - You are about to drop the column `salaryMax` on the `job` table. All the data in the column will be lost.
  - You are about to drop the column `salaryMin` on the `job` table. All the data in the column will be lost.
  - The primary key for the `user` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `avatar` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `user` table. All the data in the column will be lost.
  - You are about to drop the `comment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `interview` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `interviewer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `session` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `createdById` to the `candidate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `email` to the `candidate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `gender` to the `candidate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `candidate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phone` to the `candidate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `source` to the `candidate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `candidate` table without a default value. This is not possible if the table is not empty.
  - Made the column `education` on table `candidate` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `createdById` to the `job` table without a default value. This is not possible if the table is not empty.
  - Added the required column `departments` to the `job` table without a default value. This is not possible if the table is not empty.
  - Added the required column `level` to the `job` table without a default value. This is not possible if the table is not empty.
  - Added the required column `skills` to the `job` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `job` table without a default value. This is not possible if the table is not empty.
  - Made the column `location` on table `job` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `status` on the `job` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `role` on the `user` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "candidate" DROP CONSTRAINT "candidate_userId_fkey";

-- DropForeignKey
ALTER TABLE "comment" DROP CONSTRAINT "comment_candidate_fkey";

-- DropForeignKey
ALTER TABLE "comment" DROP CONSTRAINT "comment_interviewId_fkey";

-- DropForeignKey
ALTER TABLE "comment" DROP CONSTRAINT "comment_interviewer_fkey";

-- DropForeignKey
ALTER TABLE "interview" DROP CONSTRAINT "interview_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "interview" DROP CONSTRAINT "interview_interviewerId_fkey";

-- DropForeignKey
ALTER TABLE "interview" DROP CONSTRAINT "interview_jobId_fkey";

-- DropForeignKey
ALTER TABLE "interviewer" DROP CONSTRAINT "interviewer_userId_fkey";

-- DropForeignKey
ALTER TABLE "session" DROP CONSTRAINT "session_userId_fkey";

-- DropIndex
DROP INDEX "candidate_userId_key";

-- AlterTable
ALTER TABLE "candidate" DROP CONSTRAINT "candidate_pkey",
DROP COLUMN "experience",
DROP COLUMN "resume",
DROP COLUMN "skills",
DROP COLUMN "status",
DROP COLUMN "userId",
ADD COLUMN     "age" INTEGER,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "currentCompany" TEXT,
ADD COLUMN     "currentPosition" TEXT,
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "expectedSalary" TEXT,
ADD COLUMN     "gender" TEXT NOT NULL,
ADD COLUMN     "intro" TEXT,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "phone" TEXT NOT NULL,
ADD COLUMN     "resumeUrl" TEXT,
ADD COLUMN     "school" TEXT,
ADD COLUMN     "source" TEXT NOT NULL,
ADD COLUMN     "sourceNote" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "workYears" INTEGER,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "education" SET NOT NULL,
ADD CONSTRAINT "candidate_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "candidate_id_seq";

-- AlterTable
ALTER TABLE "job" DROP CONSTRAINT "job_pkey",
DROP COLUMN "createdBy",
DROP COLUMN "department",
DROP COLUMN "salaryMax",
DROP COLUMN "salaryMin",
ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "departments" JSONB NOT NULL,
ADD COLUMN     "level" TEXT NOT NULL,
ADD COLUMN     "skills" JSONB NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "location" SET NOT NULL,
ALTER COLUMN "requirements" SET NOT NULL,
ALTER COLUMN "requirements" SET DATA TYPE TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL,
ADD CONSTRAINT "job_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "job_id_seq";

-- AlterTable
ALTER TABLE "user" DROP CONSTRAINT "user_pkey",
DROP COLUMN "avatar",
DROP COLUMN "deletedAt",
DROP COLUMN "phone",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
DROP COLUMN "role",
ADD COLUMN     "role" TEXT NOT NULL,
ADD CONSTRAINT "user_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "user_id_seq";

-- DropTable
DROP TABLE "comment";

-- DropTable
DROP TABLE "interview";

-- DropTable
DROP TABLE "interviewer";

-- DropTable
DROP TABLE "session";

-- DropEnum
DROP TYPE "AuthorType";

-- DropEnum
DROP TYPE "CandidateStatus";

-- DropEnum
DROP TYPE "InterviewStatus";

-- DropEnum
DROP TYPE "InterviewType";

-- DropEnum
DROP TYPE "JobStatus";

-- DropEnum
DROP TYPE "Role";

-- CreateTable
CREATE TABLE "candidate_job" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_record" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rejectReason" TEXT,
    "assigneeId" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stage_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_feedback" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "round" TEXT NOT NULL,
    "interviewerName" TEXT NOT NULL,
    "interviewTime" TIMESTAMP(3) NOT NULL,
    "conclusion" TEXT NOT NULL,
    "feedbackContent" TEXT NOT NULL,
    "rejectReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "salary" TEXT NOT NULL,
    "offerDate" TIMESTAMP(3) NOT NULL,
    "expectedJoinDate" TIMESTAMP(3),
    "result" TEXT NOT NULL,
    "joined" BOOLEAN NOT NULL DEFAULT false,
    "actualJoinDate" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidate_job_candidateId_idx" ON "candidate_job"("candidateId");

-- CreateIndex
CREATE INDEX "candidate_job_jobId_idx" ON "candidate_job"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_job_candidateId_jobId_key" ON "candidate_job"("candidateId", "jobId");

-- CreateIndex
CREATE INDEX "stage_record_candidateId_idx" ON "stage_record"("candidateId");

-- CreateIndex
CREATE INDEX "stage_record_stage_idx" ON "stage_record"("stage");

-- CreateIndex
CREATE INDEX "stage_record_status_idx" ON "stage_record"("status");

-- CreateIndex
CREATE INDEX "stage_record_assigneeId_idx" ON "stage_record"("assigneeId");

-- CreateIndex
CREATE INDEX "stage_record_enteredAt_idx" ON "stage_record"("enteredAt");

-- CreateIndex
CREATE INDEX "stage_record_createdAt_idx" ON "stage_record"("createdAt");

-- CreateIndex
CREATE INDEX "interview_feedback_candidateId_idx" ON "interview_feedback"("candidateId");

-- CreateIndex
CREATE INDEX "interview_feedback_round_idx" ON "interview_feedback"("round");

-- CreateIndex
CREATE INDEX "interview_feedback_conclusion_idx" ON "interview_feedback"("conclusion");

-- CreateIndex
CREATE INDEX "interview_feedback_interviewTime_idx" ON "interview_feedback"("interviewTime");

-- CreateIndex
CREATE INDEX "interview_feedback_createdById_idx" ON "interview_feedback"("createdById");

-- CreateIndex
CREATE INDEX "interview_feedback_createdAt_idx" ON "interview_feedback"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "offer_candidateId_key" ON "offer"("candidateId");

-- CreateIndex
CREATE INDEX "offer_candidateId_idx" ON "offer"("candidateId");

-- CreateIndex
CREATE INDEX "offer_result_idx" ON "offer"("result");

-- CreateIndex
CREATE INDEX "offer_joined_idx" ON "offer"("joined");

-- CreateIndex
CREATE INDEX "offer_offerDate_idx" ON "offer"("offerDate");

-- CreateIndex
CREATE INDEX "offer_createdAt_idx" ON "offer"("createdAt");

-- CreateIndex
CREATE INDEX "operation_log_userId_idx" ON "operation_log"("userId");

-- CreateIndex
CREATE INDEX "operation_log_targetType_idx" ON "operation_log"("targetType");

-- CreateIndex
CREATE INDEX "operation_log_targetId_idx" ON "operation_log"("targetId");

-- CreateIndex
CREATE INDEX "operation_log_action_idx" ON "operation_log"("action");

-- CreateIndex
CREATE INDEX "operation_log_createdAt_idx" ON "operation_log"("createdAt");

-- CreateIndex
CREATE INDEX "candidate_email_idx" ON "candidate"("email");

-- CreateIndex
CREATE INDEX "candidate_phone_idx" ON "candidate"("phone");

-- CreateIndex
CREATE INDEX "candidate_source_idx" ON "candidate"("source");

-- CreateIndex
CREATE INDEX "candidate_createdById_idx" ON "candidate"("createdById");

-- CreateIndex
CREATE INDEX "candidate_createdAt_idx" ON "candidate"("createdAt");

-- CreateIndex
CREATE INDEX "job_status_idx" ON "job"("status");

-- CreateIndex
CREATE INDEX "job_type_idx" ON "job"("type");

-- CreateIndex
CREATE INDEX "job_location_idx" ON "job"("location");

-- CreateIndex
CREATE INDEX "job_createdById_idx" ON "job"("createdById");

-- CreateIndex
CREATE INDEX "job_createdAt_idx" ON "job"("createdAt");

-- CreateIndex
CREATE INDEX "user_email_idx" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_role_idx" ON "user"("role");

-- CreateIndex
CREATE INDEX "user_createdAt_idx" ON "user"("createdAt");

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate" ADD CONSTRAINT "candidate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_job" ADD CONSTRAINT "candidate_job_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_job" ADD CONSTRAINT "candidate_job_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_record" ADD CONSTRAINT "stage_record_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_record" ADD CONSTRAINT "stage_record_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_log" ADD CONSTRAINT "operation_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
