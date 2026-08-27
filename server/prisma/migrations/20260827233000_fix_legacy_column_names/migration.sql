-- 修复历史 db push 造成的列名漂移（仅限受影响的环境；全新部署的库列名已是 camelCase，本迁移自动跳过）
-- 幂等设计：所有操作先检查现状再执行，保证在「已漂移的本地库」和「标准的生产库」上都能安全通过

-- 1. 列名漂移修复（存在小写列才 RENAME，RENAME 而非 DROP/ADD 以保留数据）
DO $$
BEGIN
  -- candidate_tag
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidate_tag' AND column_name = 'candidateid') THEN
    ALTER TABLE "candidate_tag" RENAME COLUMN "candidateid" TO "candidateId";
    ALTER TABLE "candidate_tag" RENAME COLUMN "tagid" TO "tagId";
    ALTER TABLE "candidate_tag" RENAME COLUMN "createdat" TO "createdAt";
  END IF;
  -- job_tag
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_tag' AND column_name = 'jobid') THEN
    ALTER TABLE "job_tag" RENAME COLUMN "jobid" TO "jobId";
    ALTER TABLE "job_tag" RENAME COLUMN "tagid" TO "tagId";
    ALTER TABLE "job_tag" RENAME COLUMN "createdat" TO "createdAt";
  END IF;
  -- tag
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tag' AND column_name = 'createdat') THEN
    ALTER TABLE "tag" RENAME COLUMN "createdat" TO "createdAt";
    ALTER TABLE "tag" RENAME COLUMN "createdbyid" TO "createdById";
  END IF;
END $$;

-- 2. createdAt 默认值补齐（幂等）
ALTER TABLE "candidate_tag" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "job_tag" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "tag" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- 3. job.hcRequestId（幂等）
ALTER TABLE "job" ADD COLUMN IF NOT EXISTS "hcRequestId" TEXT;

-- 4. 外键删除行为对齐 schema（CASCADE → RESTRICT；仅当约束存在且定义不符时重建）
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT conname, conrelid::regclass::text AS tbl, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conname IN ('interview_createdById_fkey', 'communication_log_createdById_fkey', 'automation_rule_templateId_fkey')
      AND pg_get_constraintdef(oid) LIKE '%ON DELETE CASCADE%'
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', fk.tbl, fk.conname);
    IF fk.conname = 'interview_createdById_fkey' THEN
      ALTER TABLE "interview" ADD CONSTRAINT "interview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ELSIF fk.conname = 'communication_log_createdById_fkey' THEN
      ALTER TABLE "communication_log" ADD CONSTRAINT "communication_log_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ELSE
      ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "email_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
  END LOOP;
END $$;
