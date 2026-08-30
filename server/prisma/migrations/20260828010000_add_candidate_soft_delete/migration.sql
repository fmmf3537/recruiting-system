-- AlterTable：候选人软删除字段（可空，存量数据视为未删除）
ALTER TABLE "candidate" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedById" TEXT;

-- CreateIndex
CREATE INDEX "candidate_deletedAt_idx" ON "candidate"("deletedAt");

-- AddForeignKey：删除者离职时保留软删记录
ALTER TABLE "candidate" ADD CONSTRAINT "candidate_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
