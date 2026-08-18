-- 候选人合规字段：授权同意 + 匿名化标记；gender 改为选填
ALTER TABLE "candidate" ALTER COLUMN "gender" DROP NOT NULL;
ALTER TABLE "candidate" ADD COLUMN "consentAt" TIMESTAMP(3);
ALTER TABLE "candidate" ADD COLUMN "consentNote" TEXT;
ALTER TABLE "candidate" ADD COLUMN "anonymizedAt" TIMESTAMP(3);
