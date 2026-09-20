-- AI 面试大纲改为异步任务：保存任务状态，避免 LLM 长耗时请求被网关超时中断。
CREATE TYPE "OutlineGenerationStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed');

CREATE TABLE "interview_outline_generation" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "focusType" TEXT NOT NULL,
    "adjustNote" TEXT,
    "requestedById" TEXT NOT NULL,
    "status" "OutlineGenerationStatus" NOT NULL DEFAULT 'pending',
    "outlineVersionId" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_outline_generation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "interview_outline_generation_interviewId_status_idx"
  ON "interview_outline_generation"("interviewId", "status");
CREATE INDEX "interview_outline_generation_requestedById_idx"
  ON "interview_outline_generation"("requestedById");
-- PostgreSQL partial unique index：一个面试同时只能有一个排队/执行中的生成任务。
CREATE UNIQUE INDEX "interview_outline_generation_one_active_per_interview"
  ON "interview_outline_generation"("interviewId")
  WHERE "status" IN ('pending', 'processing');

ALTER TABLE "interview_outline_generation"
  ADD CONSTRAINT "interview_outline_generation_interviewId_fkey"
  FOREIGN KEY ("interviewId") REFERENCES "interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
