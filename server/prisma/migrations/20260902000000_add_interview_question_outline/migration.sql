-- F3-S：面试问题一键生成（面试大纲版本化）
-- 1. Interview 新增 focusType 字段（字典 interview_focus_type，可空兼容存量）
-- 2. 新增 interview_question_outline 表（按 interviewId + version 唯一，上限 10 版）

-- AlterTable
ALTER TABLE "interview" ADD COLUMN "focusType" TEXT;

-- CreateTable
CREATE TABLE "interview_question_outline" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "focusType" TEXT NOT NULL,
    "outline" JSONB NOT NULL,
    "adjustNote" TEXT,
    "editedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_question_outline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- 面试下按 version 升序定位下一版本号（version = max(version) + 1）
CREATE INDEX "interview_question_outline_interviewId_idx" ON "interview_question_outline"("interviewId");

-- CreateIndex
-- 同面试下版本号唯一（version 冲突兜底）
CREATE UNIQUE INDEX "interview_question_outline_interviewId_version_key" ON "interview_question_outline"("interviewId", "version");

-- AddForeignKey
ALTER TABLE "interview_question_outline" ADD CONSTRAINT "interview_question_outline_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;