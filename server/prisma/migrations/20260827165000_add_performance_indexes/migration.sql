-- CreateIndex
-- interview 当前 0 行（远小于 10 万），无需 CONCURRENTLY，可在事务内创建
CREATE INDEX "interview_status_scheduledAt_idx" ON "interview"("status", "scheduledAt");
