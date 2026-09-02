-- F4-S1：HR 考核积分事件埋点（PRD 阶段 5 F4）
-- 1. 新增 hr_score_event（积分事件流水）表，唯一约束做幂等去重
-- 2. 新增 hr_score_snapshot（周期快照）表，F4-S2 负责写入
-- 3. 两表 userId 外键 ON DELETE CASCADE（用户删除时级联清理，生产无删除动作）
-- 4. 追加 dictionary 字典种子 category='hr_score_rule' 共 8 行，description 存分值字符串
-- 注意：user 表无需 ALTER，Prisma relation 字段是纯虚拟的

-- CreateTable：积分事件流水
CREATE TABLE "hr_score_event" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "remark" TEXT,
    "bizDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_score_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable：周期积分快照
CREATE TABLE "hr_score_snapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "businessPts" INTEGER NOT NULL,
    "processPts" INTEGER NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_score_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex：幂等去重（同一用户 + 规则 + 业务对象只记一次分；PG 下 NULL 不相等，target 全空时不去重）
CREATE UNIQUE INDEX "hr_score_event_userId_ruleCode_targetType_targetId_key" ON "hr_score_event"("userId", "ruleCode", "targetType", "targetId");

-- CreateIndex：按人 + 业务日期聚合查询（F4-S2 报表）
CREATE INDEX "hr_score_event_userId_bizDate_idx" ON "hr_score_event"("userId", "bizDate");

-- CreateIndex：同一用户同周期只有一份快照
CREATE UNIQUE INDEX "hr_score_snapshot_userId_periodType_periodStart_key" ON "hr_score_snapshot"("userId", "periodType", "periodStart");

-- AddForeignKey：事件 → 用户
ALTER TABLE "hr_score_event" ADD CONSTRAINT "hr_score_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey：快照 → 用户
ALTER TABLE "hr_score_snapshot" ADD CONSTRAINT "hr_score_snapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed：积分规则字典（description 存分值整数字符串，admin 可在 /settings/dictionary 调整）
-- id 使用确定性字面量 + ON CONFLICT DO NOTHING，保证迁移可重复执行不报错
INSERT INTO "dictionary" ("id", "category", "code", "name", "sortOrder", "enabled", "description", "createdAt", "updatedAt")
VALUES
    ('dict_hr_score_resume_upload', 'hr_score_rule', 'resume_upload', '简历上传并解析成功', 1, true, '2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dict_hr_score_agency_resume', 'hr_score_rule', 'agency_resume_process', '猎头渠道简历处理', 2, true, '3', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dict_hr_score_dept_recommend', 'hr_score_rule', 'dept_recommend', '推荐到用人部门', 3, true, '5', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dict_hr_score_interview_done', 'hr_score_rule', 'interview_complete', '完成一场面试', 4, true, '10', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dict_hr_score_offer_sent', 'hr_score_rule', 'offer_sent', '发出 Offer', 5, true, '30', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dict_hr_score_joined', 'hr_score_rule', 'candidate_joined', '候选人入职', 6, true, '50', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dict_hr_score_offer_rejected', 'hr_score_rule', 'offer_rejected', 'Offer 被拒', 7, true, '-10', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dict_hr_score_probation_out', 'hr_score_rule', 'probation_out', '试用期淘汰', 8, true, '-20', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
