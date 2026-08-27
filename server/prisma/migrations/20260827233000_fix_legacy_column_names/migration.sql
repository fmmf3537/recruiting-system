-- 修复历史 db push 造成的列名漂移：小写列名改回 Prisma 标准 camelCase
-- 使用 RENAME COLUMN 而非 DROP/ADD，完整保留现有数据（candidate_tag / job_tag 当前为空表，tag 数据保留）

-- candidate_tag
ALTER TABLE "candidate_tag" RENAME COLUMN "candidateid" TO "candidateId";
ALTER TABLE "candidate_tag" RENAME COLUMN "tagid" TO "tagId";
ALTER TABLE "candidate_tag" RENAME COLUMN "createdat" TO "createdAt";
ALTER TABLE "candidate_tag" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- job_tag
ALTER TABLE "job_tag" RENAME COLUMN "jobid" TO "jobId";
ALTER TABLE "job_tag" RENAME COLUMN "tagid" TO "tagId";
ALTER TABLE "job_tag" RENAME COLUMN "createdat" TO "createdAt";
ALTER TABLE "job_tag" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- tag
ALTER TABLE "tag" RENAME COLUMN "createdat" TO "createdAt";
ALTER TABLE "tag" RENAME COLUMN "createdbyid" TO "createdById";
ALTER TABLE "tag" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- job：新增 hcRequestId（可空，关联招聘需求）
ALTER TABLE "job" ADD COLUMN "hcRequestId" TEXT;

-- 外键删除行为与 schema 对齐：CASCADE → RESTRICT（防止误删用户时连带删除业务数据）
ALTER TABLE "interview" DROP CONSTRAINT "interview_createdById_fkey";
ALTER TABLE "interview" ADD CONSTRAINT "interview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "communication_log" DROP CONSTRAINT "communication_log_createdById_fkey";
ALTER TABLE "communication_log" ADD CONSTRAINT "communication_log_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automation_rule" DROP CONSTRAINT "automation_rule_templateId_fkey";
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "email_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
