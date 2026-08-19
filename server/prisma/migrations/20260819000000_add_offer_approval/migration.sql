-- AlterTable：Offer 增加审批流字段（参照 hc_request 审批模式）
ALTER TABLE "offer" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'draft',
ADD COLUMN "approverId" TEXT,
ADD COLUMN "approveNote" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "rejectedAt" TIMESTAMP(3);

-- 历史数据兼容：已存在的 Offer 视为已发送，保持现有行为（可直接录入候选人答复）
UPDATE "offer" SET "status" = 'sent';

-- CreateIndex
CREATE INDEX "offer_status_idx" ON "offer"("status");

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
