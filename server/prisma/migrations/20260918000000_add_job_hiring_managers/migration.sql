-- 职位招聘负责人。均允许为空，历史职位继续沿用原有部门范围，不影响现有数据。
ALTER TABLE "job" ADD COLUMN "hiringManagerId" TEXT;
ALTER TABLE "job" ADD COLUMN "collaboratorIds" JSONB NOT NULL DEFAULT '[]';

CREATE INDEX "job_hiringManagerId_idx" ON "job"("hiringManagerId");
