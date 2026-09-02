-- CreateTable
-- 简历自动打分表（F2-S）：候选人 × 职位 唯一；服务端按字典权重重算综合分后落库
CREATE TABLE "ai_match_score" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "grade" TEXT NOT NULL,
    "summary" TEXT,
    "dimensions" JSONB NOT NULL,
    "risks" JSONB,
    "highlights" JSONB,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL DEFAULT 'v1',
    "triggeredBy" TEXT NOT NULL,
    "createdById" TEXT,
    "resumeHash" TEXT,
    "jdHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_match_score_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- 职位下按综合分降序展示候选人排行（PRD §3.3 列表展示）
CREATE INDEX "ai_match_score_jobId_overallScore_idx" ON "ai_match_score"("jobId", "overallScore");

-- CreateIndex
-- 候选人 × 职位 唯一：同对组合反复打分走 upsert 覆盖（PRD §3.6）
CREATE UNIQUE INDEX "ai_match_score_candidateId_jobId_key" ON "ai_match_score"("candidateId", "jobId");

-- AddForeignKey
ALTER TABLE "ai_match_score" ADD CONSTRAINT "ai_match_score_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_match_score" ADD CONSTRAINT "ai_match_score_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
