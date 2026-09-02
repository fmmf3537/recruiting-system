-- F5-S：猎头推荐通道（PRD §7）
-- 1. 新增 agency（猎头机构）表
-- 2. 新增 agency_link（推荐链接）表
-- 3. 机构停用后其下链接不级联删除（Restrict），由 service 层判定失效
-- 4. jobId 外键 ON DELETE SET NULL，职位删除保留链接（不丢失推荐入口）

-- CreateTable：猎头机构
CREATE TABLE "agency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "remark" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable：猎头推荐链接
CREATE TABLE "agency_link" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "jobId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex：机构名称唯一
CREATE UNIQUE INDEX "agency_name_key" ON "agency"("name");

-- CreateIndex：链接 token 唯一（落地页直接 path 段查表）
CREATE UNIQUE INDEX "agency_link_token_key" ON "agency_link"("token");

-- CreateIndex：列表/统计索引
CREATE INDEX "agency_enabled_idx" ON "agency"("enabled");
CREATE INDEX "agency_createdAt_idx" ON "agency"("createdAt");
CREATE INDEX "agency_link_agencyId_idx" ON "agency_link"("agencyId");
CREATE INDEX "agency_link_jobId_idx" ON "agency_link"("jobId");
CREATE INDEX "agency_link_createdById_idx" ON "agency_link"("createdById");
CREATE INDEX "agency_link_disabledAt_idx" ON "agency_link"("disabledAt");
CREATE INDEX "agency_link_expiresAt_idx" ON "agency_link"("expiresAt");

-- AddForeignKey：链接 → 机构（Restrict：机构停用/删除不级联清链接，由 service 判定失效）
ALTER TABLE "agency_link" ADD CONSTRAINT "agency_link_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey：链接 → 职位（SetNull：职位删除保留链接）
ALTER TABLE "agency_link" ADD CONSTRAINT "agency_link_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE SET NULL ON UPDATE CASCADE;